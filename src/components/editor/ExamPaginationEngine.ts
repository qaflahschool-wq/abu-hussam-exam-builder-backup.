import { Exam, ExamLayoutConfig } from '../../types/index.ts';
import { getPaperDimensionsMm, MM_TO_PX } from './layoutDefaults.ts';

export type PaginatedBlockKind = 'section-header' | 'passage' | 'question';

export interface PaginatedBlock {
  measureId: string;
  kind: PaginatedBlockKind;
  sIdx: number;
  qIdx?: number;
  sectionId: string;
  questionId?: string;
  heightPx: number;
}

export interface PaginatedPage {
  pageIndex: number; // 0-based
  hasMainHeader: boolean;
  hasRunningHeader: boolean;
  hasClosingFooter: boolean;
  columns: PaginatedBlock[][]; // [col0] for 1-col, [col0, col1] for 2-col
  columnHeightsPx: number[];
  contentCapacityPx: number;
}

export interface PaginationComputationResult {
  pages: PaginatedPage[];
  totalPages: number;
  questionPageMap: Record<string, number>; // question.id -> 1-based page number
  sectionPageMap: Record<string, number>;  // section.id -> 1-based page number
  overflowDetected: boolean;
  targetPageCount?: number;
  targetSatisfied: boolean;
  diagnosticMessage?: string;
}

export interface MeasuredHeights {
  mainHeaderHeightPx: number;
  runningHeaderHeightPx: number;
  closingFooterHeightPx: number;
  pageNumberBarHeightPx: number;
  blocks: Record<string, number>;
}

/**
 * Computes exact printable dimensions in CSS pixels for a discrete A4 sheet.
 */
export function getSheetGeometryPx(cfg: ExamLayoutConfig) {
  const { widthMm, heightMm } = getPaperDimensionsMm(cfg.orientation);
  const sheetWidthPx = widthMm * MM_TO_PX;
  const sheetHeightPx = heightMm * MM_TO_PX;

  const borderStrokePx =
    cfg.borderMode && cfg.borderMode !== 'none' ? (cfg.borderWidthPx || 2) * 2 : 0;
  const borderPadPx =
    cfg.borderMode && cfg.borderMode !== 'none' ? (cfg.borderPaddingMm ?? 4) * MM_TO_PX : 0;

  const usesDefaultMargins =
    cfg.marginTopMm === 12 &&
    cfg.marginRightMm === 12 &&
    cfg.marginBottomMm === 12 &&
    cfg.marginLeftMm === 12;

  const marginTopPx = usesDefaultMargins ? 24 : cfg.marginTopMm * MM_TO_PX;
  const marginBottomPx = usesDefaultMargins ? 24 : cfg.marginBottomMm * MM_TO_PX;
  const marginLeftPx = usesDefaultMargins ? 24 : cfg.marginLeftMm * MM_TO_PX;
  const marginRightPx = usesDefaultMargins ? 24 : cfg.marginRightMm * MM_TO_PX;

  const innerHeightPx = Math.max(
    240,
    sheetHeightPx - marginTopPx - marginBottomPx - borderStrokePx - borderPadPx * 2 - 4
  );
  const innerWidthPx = Math.max(
    200,
    sheetWidthPx - marginLeftPx - marginRightPx - borderStrokePx - borderPadPx * 2
  );

  const columnCount = cfg.columns === 2 ? 2 : 1;
  const colGap = cfg.columnGapPx ?? 18;
  const columnWidthPx =
    columnCount === 2 ? (innerWidthPx - colGap) / 2 : innerWidthPx;

  return {
    widthMm,
    heightMm,
    sheetWidthPx,
    sheetHeightPx,
    innerWidthPx,
    innerHeightPx,
    columnWidthPx,
    borderPadPx,
  };
}

/**
 * Splits exam sections & questions into discrete, non-overlapping A4 pages.
 * Guarantees:
 *  - No question is sliced between columns or pages (unless taller than 1 entire printable page).
 *  - No section header is stranded orphaned at the bottom of a page/column without its first child item.
 *  - Honors explicit section.startOnNewPage, section.pageBreakAfter, q.pageBreakBefore, q.pageBreakAfter.
 *  - Never leaves an empty blank trailing page.
 */
export function computeExamPagination(
  exam: Exam,
  cfg: ExamLayoutConfig,
  measured: MeasuredHeights
): PaginationComputationResult {
  const geom = getSheetGeometryPx(cfg);
  const pageNumReserve = cfg.showPageNumbers !== false ? Math.max(24, measured.pageNumberBarHeightPx) : 0;
  const mainHeaderReserve = Math.max(80, measured.mainHeaderHeightPx);
  const runningHeaderReserve = cfg.repeatHeaderOnPages !== false ? Math.max(28, measured.runningHeaderHeightPx) : 0;
  const closingFooterReserve = Math.max(46, measured.closingFooterHeightPx);

  const colCount = cfg.columns === 2 ? 2 : 1;
  const qGap = cfg.questionGapPx ?? 12;
  const sGap = cfg.sectionGapPx ?? 18;

  const pageBodyCapacity = (pageIdx: number): number => {
    const headerH = pageIdx === 0 ? mainHeaderReserve : runningHeaderReserve;
    return Math.max(160, geom.innerHeightPx - headerH - pageNumReserve - 6);
  };

  interface WorkingPage {
    pageIndex: number;
    columns: PaginatedBlock[][];
    columnHeightsPx: number[];
    capacityPx: number;
    activeCol: number;
  }

  const pages: WorkingPage[] = [];

  const createPage = (pageIndex: number): WorkingPage => ({
    pageIndex,
    columns: Array.from({ length: colCount }, () => []),
    columnHeightsPx: Array.from({ length: colCount }, () => 0),
    capacityPx: pageBodyCapacity(pageIndex),
    activeCol: 0,
  });

  pages.push(createPage(0));

  const getCurrentPage = () => pages[pages.length - 1];

  const advanceToNextColumnOrPage = (forceNewPage = false): WorkingPage => {
    const cur = getCurrentPage();
    if (!forceNewPage && cur.activeCol + 1 < colCount) {
      cur.activeCol += 1;
      return cur;
    }
    // Only open a new page if the current page actually has at least 1 block
    const hasAnyBlock = cur.columns.some((col) => col.length > 0);
    if (!hasAnyBlock) {
      cur.activeCol = 0;
      return cur;
    }
    const next = createPage(pages.length);
    pages.push(next);
    return next;
  };

  const getBlockHeight = (id: string, fallback = 48): number => {
    const h = measured.blocks[id];
    return typeof h === 'number' && h > 0 ? h : fallback;
  };

  const placeBlock = (block: PaginatedBlock, gapAbove: number) => {
    const cur = getCurrentPage();
    const cIdx = cur.activeCol;
    const colArr = cur.columns[cIdx];
    const used = cur.columnHeightsPx[cIdx];
    const addH = (colArr.length > 0 ? gapAbove : 0) + block.heightPx;
    colArr.push(block);
    cur.columnHeightsPx[cIdx] = used + addH;
  };

  exam.sections.forEach((sec, sIdx) => {
    const secHeadId = `measure-sec-head-${sIdx}`;
    const secHeadH = getBlockHeight(secHeadId, 44);
    const secHeadBlock: PaginatedBlock = {
      measureId: secHeadId,
      kind: 'section-header',
      sIdx,
      sectionId: sec.id,
      heightPx: secHeadH,
    };

    // Determine minimum companion height (first passage or first question) to prevent orphaned section headers
    let firstCompanionH = 0;
    const firstQ = sec.questions[0];
    if (firstQ) {
      if (firstQ.passage !== undefined) {
        firstCompanionH = getBlockHeight(`measure-passage-${sIdx}-0`, 70) + qGap;
      } else {
        firstCompanionH = getBlockHeight(`measure-q-${sIdx}-0`, 52) + 8;
      }
    }

    // Honor section.startOnNewPage (unless already at the very top of page 0 or an empty page)
    if (sec.startOnNewPage) {
      const cur = getCurrentPage();
      const hasBlocks = cur.columns.some((c) => c.length > 0);
      if (hasBlocks) {
        advanceToNextColumnOrPage(true);
      }
    }

    // Honor orphan-heading guard: section heading + first companion must fit in active column (if active column is non-empty)
    let curPage = getCurrentPage();
    let curCol = curPage.activeCol;
    let used = curPage.columnHeightsPx[curCol];
    const gapAboveSec = curPage.columns[curCol].length > 0 ? sGap : 0;
    const combinedNeed = gapAboveSec + secHeadH + firstCompanionH;

    if (curPage.columns[curCol].length > 0 && used + combinedNeed > curPage.capacityPx) {
      // Also check if firstQ itself has pageBreakBefore — handled cleanly if we break here
      advanceToNextColumnOrPage(false);
    }

    // If firstQ has explicit pageBreakBefore, advance BEFORE placing section header so heading stays with q0!
    if (firstQ?.pageBreakBefore) {
      const pCheck = getCurrentPage();
      if (pCheck.columns.some((c) => c.length > 0)) {
        advanceToNextColumnOrPage(true);
      }
    }

    curPage = getCurrentPage();
    curCol = curPage.activeCol;
    placeBlock(secHeadBlock, curPage.columns[curCol].length > 0 ? sGap : 0);

    // Place each question in this section
    sec.questions.forEach((q, qIdx) => {
      // Explicit pageBreakBefore for subsequent questions (qIdx > 0; qIdx === 0 handled above with section head)
      if (qIdx > 0 && q.pageBreakBefore) {
        const pCheck = getCurrentPage();
        if (pCheck.columns.some((c) => c.length > 0)) {
          advanceToNextColumnOrPage(true);
        }
      }

      // 1) Reading passage block (if present)
      if (q.passage !== undefined) {
        const passId = `measure-passage-${sIdx}-${qIdx}`;
        const passH = getBlockHeight(passId, 80);
        const passBlock: PaginatedBlock = {
          measureId: passId,
          kind: 'passage',
          sIdx,
          qIdx,
          sectionId: sec.id,
          questionId: q.id,
          heightPx: passH,
        };

        const cp = getCurrentPage();
        const cc = cp.activeCol;
        const cArr = cp.columns[cc];
        const gapNeeded = cArr.length > 0 ? (qIdx === 0 ? 8 : qGap) : 0;
        const shouldKeep =
          q.keepTogether !== false && cfg.keepQuestionsTogether !== false;

        // Try to keep passage with at least part of the question if it's the first item after heading or short passage
        if (
          shouldKeep &&
          cArr.length > 0 &&
          !(cArr.length === 1 && cArr[0].kind === 'section-header' && qIdx === 0) &&
          cp.columnHeightsPx[cc] + gapNeeded + passH > cp.capacityPx
        ) {
          advanceToNextColumnOrPage(false);
        }

        const targetP = getCurrentPage();
        const targetC = targetP.activeCol;
        placeBlock(passBlock, targetP.columns[targetC].length > 0 ? (qIdx === 0 ? 8 : qGap) : 0);
      }

      // 2) Question card itself
      const qId = `measure-q-${sIdx}-${qIdx}`;
      const qH = getBlockHeight(qId, 56);
      const qBlock: PaginatedBlock = {
        measureId: qId,
        kind: 'question',
        sIdx,
        qIdx,
        sectionId: sec.id,
        questionId: q.id,
        heightPx: qH,
      };

      const cp = getCurrentPage();
      const cc = cp.activeCol;
      const cArr = cp.columns[cc];
      const gapNeeded = cArr.length > 0 ? (qIdx === 0 && q.passage === undefined ? 8 : qGap) : 0;
      const shouldKeep =
        q.keepTogether !== false && cfg.keepQuestionsTogether !== false;

      // Never split a question off the very first item below a just-started empty column/heading if it already didn't fit
      const isOnlySectionHeaderOnCol =
        cArr.length === 1 && cArr[0].kind === 'section-header';

      if (
        shouldKeep &&
        cArr.length > 0 &&
        !isOnlySectionHeaderOnCol &&
        cp.columnHeightsPx[cc] + gapNeeded + qH > cp.capacityPx
      ) {
        // If we are on a column right after placing ONLY a section header, pull the section header too? handled by firstCompanionH!
        advanceToNextColumnOrPage(false);
      } else if (
        shouldKeep &&
        isOnlySectionHeaderOnCol &&
        cp.columnHeightsPx[cc] + gapNeeded + qH > cp.capacityPx &&
        cp.pageIndex >= 0
      ) {
        // Section header + first question couldn't fit together only if the page already wasn't empty before sec-head (impossible since firstCompanionH checked it),
        // or if q0 alone is taller than a whole page — keep it on this page so it doesn't loop!
      }

      const finalP = getCurrentPage();
      const finalC = finalP.activeCol;
      placeBlock(qBlock, finalP.columns[finalC].length > 0 ? (qIdx === 0 && q.passage === undefined ? 8 : qGap) : 0);

      // Honor explicit q.pageBreakAfter (only if there is still more content after this question)
      const hasMoreAfter =
        qIdx < sec.questions.length - 1 ||
        exam.sections.slice(sIdx + 1).some((nextS) => nextS.questions.length > 0);
      if (q.pageBreakAfter && hasMoreAfter) {
        advanceToNextColumnOrPage(true);
      }
    });

    // Honor section.pageBreakAfter if subsequent sections exist
    const hasFollowingSectionContent = exam.sections
      .slice(sIdx + 1)
      .some((nextS) => nextS.questions.length > 0);
    if (sec.pageBreakAfter && hasFollowingSectionContent) {
      advanceToNextColumnOrPage(true);
    }
  });

  // Remove any completely empty trailing page (guards against blank pages)
  while (pages.length > 1 && pages[pages.length - 1].columns.every((col) => col.length === 0)) {
    pages.pop();
  }

  // Ensure closing official footer fits comfortably at bottom of the last page;
  // only move closing footer if last page is genuinely crowded (> capacity - closingFooterReserve)
  const lastPage = pages[pages.length - 1];
  const maxColUsedOnLast = Math.max(...lastPage.columnHeightsPx, 0);
  const lastPageHasRoomForFooter =
    maxColUsedOnLast + closingFooterReserve + 8 <= lastPage.capacityPx;

  // Notice: if closing footer wouldn't fit on last page AND last page has > 1 block,
  // shift the final question onto a clean next page so footer never floats alone on an otherwise blank page!
  if (!lastPageHasRoomForFooter && lastPage.columns.some((col) => col.length > 1)) {
    // Move the last block from the tallest column onto a new page with closing footer
    let tallestColIdx = 0;
    for (let i = 1; i < colCount; i++) {
      if (lastPage.columnHeightsPx[i] > lastPage.columnHeightsPx[tallestColIdx]) {
        tallestColIdx = i;
      }
    }
    const lastCol = lastPage.columns[tallestColIdx];
    const lastBlock = lastCol[lastCol.length - 1];
    // Avoid stranding a section header alone by moving both sec-header + last question if needed
    const prevBlock = lastCol.length >= 2 ? lastCol[lastCol.length - 2] : undefined;
    if (lastBlock && lastBlock.kind === 'question') {
      const nextP = createPage(pages.length);
      if (prevBlock && prevBlock.kind === 'section-header' && lastBlock.qIdx === 0) {
        lastCol.splice(lastCol.length - 2, 2);
        nextP.columns[0].push(prevBlock, lastBlock);
        nextP.columnHeightsPx[0] = prevBlock.heightPx + 8 + lastBlock.heightPx;
      } else {
        lastCol.pop();
        nextP.columns[0].push(lastBlock);
        nextP.columnHeightsPx[0] = lastBlock.heightPx;
      }
      pages.push(nextP);
    }
  }

  // Final cleanup: ensure no trailing page is empty
  while (pages.length > 1 && pages[pages.length - 1].columns.every((col) => col.length === 0)) {
    pages.pop();
  }

  const totalPages = pages.length;
  const questionPageMap: Record<string, number> = {};
  const sectionPageMap: Record<string, number> = {};

  const finalizedPages: PaginatedPage[] = pages.map((p, idx) => {
    p.columns.forEach((col) => {
      col.forEach((blk) => {
        if (blk.questionId && blk.kind === 'question') {
          questionPageMap[blk.questionId] = idx + 1;
        }
        if (blk.kind === 'section-header' && !sectionPageMap[blk.sectionId]) {
          sectionPageMap[blk.sectionId] = idx + 1;
        }
      });
    });

    return {
      pageIndex: idx,
      hasMainHeader: idx === 0,
      hasRunningHeader: idx > 0 && cfg.repeatHeaderOnPages !== false,
      hasClosingFooter: idx === totalPages - 1,
      columns: p.columns,
      columnHeightsPx: p.columnHeightsPx,
      contentCapacityPx: p.capacityPx,
    };
  });

  const pMode = cfg.paginationMode || 'auto';
  const targetPageCount =
    pMode === 'one_page' ? 1 : pMode === 'two_pages' ? 2 : undefined;

  let targetSatisfied = true;
  let diagnosticMessage: string | undefined;

  if (pMode === 'one_page' && totalPages > 1) {
    targetSatisfied = false;
    diagnosticMessage = `المحتوى الحالي يحتاج ${totalPages} صفحات A4 للعرض بوضوح (الخط الآمن ≥ 9.5pt). يمكنك تقليل الهوامش أو التباعد أو اختيار "توزيع تلقائي" أو "صفحتان" دون أي قص للأسئلة.`;
  } else if (pMode === 'one_page' && totalPages === 1) {
    diagnosticMessage = 'الاختبار مُنسّق بالكامل في صفحة A4 واحدة واضحة ومقروءة.';
  } else if (pMode === 'two_pages' && totalPages > 2) {
    targetSatisfied = false;
    diagnosticMessage = `الهدف المحدد (صفحتان)، ولكن المحتوى الفعلي يمتد حالياً إلى ${totalPages} صفحات لضمان عدم تصغير الخط أو قص أي سؤال.`;
  } else if (pMode === 'two_pages' && totalPages === 2) {
    diagnosticMessage = 'تم توزيع الاختبار بدقة في صفحتين متوازنتين.';
  } else if (pMode === 'auto') {
    diagnosticMessage =
      totalPages === 1
        ? 'التوزيع التلقائي الذكي: اتسع الاختبار في صفحة A4 واحدة بوضوح كامل.'
        : `التوزيع التلقائي الذكي: تم توزيع الاختبار تلقائياً على ${totalPages} صفحات A4 دون قص أو تداخل.`;
  }

  return {
    pages: finalizedPages,
    totalPages,
    questionPageMap,
    sectionPageMap,
    overflowDetected: !targetSatisfied,
    targetPageCount,
    targetSatisfied,
    diagnosticMessage,
  };
}
