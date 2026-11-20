import { D1AuthVersionReader } from './server/cloudflare/d1AuthVersionReader.js';
import bcrypt from 'bcryptjs';
import { D1UserRepository } from './server/cloudflare/d1UserRepository.js';
import { WorkerAuthService } from './server/cloudflare/workerAuthService.js';
import { authenticateWorkerRequest } from './server/cloudflare/workerAuthGuard.js';
import { QuestionImageStorage, type R2Bucket } from './server/cloudflare/questionImageStorage.js';
import { hasValidExamImagePayload } from './server/examImageValidation.js';
import { DEFAULT_CURRICULA } from './server/cloudflare/defaultCurricula.js';

interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  BOOTSTRAP_TOKEN?: string;
  GEMINI_API_KEY?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  QUESTION_IMAGES?: R2Bucket;
  BROWSER?: { quickAction(action: 'pdf', options: Record<string, unknown>): Promise<Response> };
}

interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch?<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  // Same-origin is the intended deployment. Cross-origin access remains denied
  // until an explicit production origin allowlist is configured.
  if (origin) headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}

function clientIp(request: Request): string {
  const value = request.headers.get('CF-Connecting-IP') || '';
  return value.slice(0, 128) || 'unknown';
}

function serviceUnavailable(env: Env): boolean {
  return !env.DB || typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32;
}

function canAccessQuestionScope(user: Record<string, unknown>, grade: string, subjectId: string): boolean {
  const role = String(user.role || '');
  if (['PlatformOwner', 'Administrator', 'SchoolAdmin'].includes(role)) return true;
  const grades = Array.isArray(user.assignedGrades) ? user.assignedGrades.map(String) : [];
  const subjects = Array.isArray(user.assignedSubjects) ? user.assignedSubjects.map(String) : [];
  if (grades.length === 0 || subjects.length === 0) return false;
  return (grades.includes('all') || grades.includes(grade)) &&
    (subjects.includes('all') || subjects.includes(subjectId));
}

function canEditQuestion(user: Record<string, unknown>, question: Record<string, unknown>): boolean {
  if (question.ownerId === user.id) return true;
  const shares = Array.isArray(question.sharedWith) ? question.sharedWith : [];
  return shares.some((entry) =>
    Boolean(entry) && typeof entry === 'object' &&
    (entry as Record<string, unknown>).userId === user.id &&
    (entry as Record<string, unknown>).permission === 'edit'
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!url.pathname.startsWith('/api/') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }



    if (url.pathname === '/api/worker/questions' && request.method === 'GET') {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const grade = url.searchParams.get('grade') || '';
        const subjectId = url.searchParams.get('subjectId') || '';
        const unitId = url.searchParams.get('unitId') || '';
        const type = url.searchParams.get('type') || '';
        const difficulty = url.searchParams.get('difficulty') || '';
        const search = (url.searchParams.get('search') || '').trim().toLocaleLowerCase();
        const sourceCode = url.searchParams.get('sourceCode') || '';
        const educationalLevel = url.searchParams.get('educationalLevel') || '';
        const grammarCategory = url.searchParams.get('grammarCategory') || '';
        const result = await env.DB.prepare(
          'SELECT record_json FROM questions WHERE owner_id = ? ORDER BY created_at DESC'
        ).bind(auth.user.id).all<{ record_json: string }>();
        if (!result.success) return json({ error: 'Question bank unavailable' }, 503);
        const assignedGrades = Array.isArray(auth.user.assignedGrades) ? auth.user.assignedGrades.map(String) : [];
        const assignedSubjects = Array.isArray(auth.user.assignedSubjects) ? auth.user.assignedSubjects.map(String) : [];
        const unrestricted = ['PlatformOwner', 'Administrator', 'SchoolAdmin'].includes(String(auth.user.role)) ||
          assignedGrades.includes('all') || assignedSubjects.includes('all');
        const list = (result.results || []).flatMap((row) => {
          let question: Record<string, unknown>;
          try { question = JSON.parse(row.record_json) as Record<string, unknown>; } catch { return []; }
          if (typeof question.id !== 'string' || typeof question.grade !== 'string') return [];
          const qSubject = typeof question.subjectId === 'string' ? question.subjectId : 'subj-en';
          if (!unrestricted && (!assignedGrades.includes(question.grade) || !assignedSubjects.includes(qSubject))) return [];
          if (grade && question.grade !== grade) return [];
          if (subjectId && qSubject !== subjectId) return [];
          if (unitId && question.unitId !== unitId) return [];
          if (type && question.type !== type) return [];
          if (difficulty && question.difficulty !== difficulty) return [];
          if (sourceCode && question.sourceCode !== sourceCode) return [];
          if (educationalLevel && question.educationalLevel !== educationalLevel) return [];
          if (grammarCategory && question.grammarCategory !== grammarCategory) return [];
          if (search && ![question.questionText, question.instructions, question.modelAnswer]
            .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(search))) return [];
          return [question];
        });
        return json(list);
      } catch (error) {
        console.error('Worker question bank read failed', error);
        return json({ error: 'Question bank unavailable' }, 500);
      }
    }


    const questionItemPathPrefix = '/api/worker/questions/';
    const questionItemId = url.pathname.startsWith(questionItemPathPrefix) ? url.pathname.slice(questionItemPathPrefix.length) : '';
    const questionItemMatch = /^[A-Za-z0-9_-]{1,128}$/.test(questionItemId) ? questionItemId : null;
    if ((url.pathname === '/api/worker/questions' && request.method === 'POST') ||
        (questionItemMatch && (request.method === 'PUT' || request.method === 'DELETE'))) {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);

        if (url.pathname === '/api/worker/questions' && request.method === 'POST') {
          const length = Number(request.headers.get('Content-Length') || 0);
          if (length > 10_000_000) return json({ error: 'Question payload is too large' }, 413);
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid question payload' }, 400);
          const input = body as Record<string, unknown>;
          const grade = typeof input.grade === 'string' ? input.grade.trim() : '';
          const subjectId = typeof input.subjectId === 'string' && input.subjectId.trim() ? input.subjectId.trim() : 'subj-en';
          if (typeof input.questionText !== 'string' || !input.questionText.trim() ||
              typeof input.modelAnswer !== 'string' || !input.modelAnswer.trim() || !grade ||
              grade.length > 64 || subjectId.length > 128 ||
              input.questionText.length > 20_000 || input.modelAnswer.length > 20_000) {
            return json({ error: 'Question text, grade, and model answer are required' }, 400);
          }
          if (!canAccessQuestionScope(auth.user as Record<string, unknown>, grade, subjectId)) {
            return json({ error: 'FORBIDDEN_ACADEMIC_SCOPE' }, 403);
          }
          const role = String(auth.user.role || '');
          const hasAIAccess = ['PlatformOwner', 'Administrator'].includes(role) && auth.user.hasAIAccess === true;
          const type = typeof input.type === 'string' ? input.type : '';
          const isQuranQuestion = subjectId === 'subj-quran' || type.startsWith('Quran');
          const createdAt = new Date().toISOString();
          const question: Record<string, unknown> = {
            ...input,
            id: `q-${crypto.randomUUID()}`,
            ownerId: auth.user.id,
            subjectId,
            preserveDiacritics: isQuranQuestion ? true : input.preserveDiacritics,
            source: hasAIAccess ? (input.source || 'Question Bank') : 'Teacher Manual',
            sourceCode: hasAIAccess
              ? (input.sourceCode || 'CURRICULUM')
              : input.sourceCode === 'IMAGE_SOURCE' ? 'TEACHER_MANUAL' : (input.sourceCode || 'TEACHER_MANUAL'),
            educationalLevel: input.educationalLevel || 'BASIC',
            sharedWith: [],
            createdAt,
          };
          const result = await env.DB.prepare(
            'INSERT INTO questions (id, owner_id, subject_id, grade, unit_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)'
          ).bind(
            question.id, auth.user.id, subjectId, grade,
            typeof input.unitId === 'string' ? input.unitId : null,
            JSON.stringify(question), createdAt
          ).run();
          if (!result.success) return json({ error: 'Question could not be saved' }, 503);
          return json({ success: true, question });
        }

        const questionId = questionItemMatch || '';
        const row = await env.DB.prepare('SELECT record_json FROM questions WHERE id = ? LIMIT 1')
          .bind(questionId).first<{ record_json: string }>();
        if (!row) return json({ error: 'QUESTION_NOT_FOUND' }, 404);
        let existing: Record<string, unknown>;
        try {
          const parsed: unknown = JSON.parse(row.record_json);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid record');
          existing = parsed as Record<string, unknown>;
        } catch {
          return json({ error: 'Question record is invalid' }, 500);
        }
        const existingGrade = typeof existing.grade === 'string' ? existing.grade : '';
        const existingSubject = typeof existing.subjectId === 'string' ? existing.subjectId : 'subj-en';
        if (!canAccessQuestionScope(auth.user as Record<string, unknown>, existingGrade, existingSubject)) {
          return json({ error: 'FORBIDDEN_ACADEMIC_SCOPE' }, 403);
        }

        if (request.method === 'DELETE') {
          if ((existing.ownerId || 'usr-admin') !== auth.user.id) return json({ error: 'FORBIDDEN_QUESTION_DELETE' }, 403);
          const removed = await env.DB.prepare('DELETE FROM questions WHERE id = ? AND owner_id = ?')
            .bind(questionId, auth.user.id).run();
          if (!removed.success) return json({ error: 'Question could not be deleted' }, 503);
          if (Number(removed.meta?.changes || 0) !== 1) return json({ error: 'QUESTION_NOT_FOUND' }, 404);
          return json({ success: true });
        }

        if (!canEditQuestion(auth.user as Record<string, unknown>, existing)) {
          return json({ error: 'FORBIDDEN_QUESTION_EDIT' }, 403);
        }
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid question update' }, 400);
        const patch = body as Record<string, unknown>;
        const { ownerId: _owner, createdBy: _creator, sharedWith: _shares, id: _id, createdAt: _created, updatedAt: _updated, ...safePatch } = patch;
        const nextGrade = typeof safePatch.grade === 'string' ? safePatch.grade : existingGrade;
        const nextSubject = typeof safePatch.subjectId === 'string' ? safePatch.subjectId : existingSubject;
        if (!canAccessQuestionScope(auth.user as Record<string, unknown>, nextGrade, nextSubject)) {
          return json({ error: 'FORBIDDEN_ACADEMIC_SCOPE' }, 403);
        }
        if ((safePatch.questionText !== undefined && (typeof safePatch.questionText !== 'string' || !safePatch.questionText.trim())) ||
            (safePatch.modelAnswer !== undefined && (typeof safePatch.modelAnswer !== 'string' || !safePatch.modelAnswer.trim()))) {
          return json({ error: 'Question text and model answer cannot be empty' }, 400);
        }
        const updatedAt = new Date().toISOString();
        const updated: Record<string, unknown> = {
          ...existing,
          ...safePatch,
          id: questionId,
          ownerId: existing.ownerId,
          updatedAt,
        };
        const saved = await env.DB.prepare(
          'UPDATE questions SET subject_id = ?, grade = ?, unit_id = ?, record_json = ?, updated_at = ? WHERE id = ?'
        ).bind(
          nextSubject, nextGrade,
          typeof updated.unitId === 'string' ? updated.unitId : null,
          JSON.stringify(updated), updatedAt, questionId
        ).run();
        if (!saved.success) return json({ error: 'Question could not be updated' }, 503);
        return json({ success: true, question: updated });
      } catch (error) {
        console.error('Worker question mutation failed', error);
        return json({ error: 'Question operation failed' }, 500);
      }
    }

    if (url.pathname === '/api/worker/catalog/subjects' && request.method === 'GET') {
      if (!env.DB) return json({ error: 'Catalog unavailable' }, 503);
      try {
        const activeOnly = url.searchParams.get('active') === 'true';
        const result = activeOnly
          ? await env.DB.prepare('SELECT record_json FROM subjects WHERE is_active = 1 ORDER BY sort_order ASC').all<{ record_json: string }>()
          : await env.DB.prepare('SELECT record_json FROM subjects ORDER BY sort_order ASC').all<{ record_json: string }>();
        if (!result.success) return json({ error: 'Catalog unavailable' }, 503);
        const subjects = (result.results || []).map((row) => {
          const value: unknown = JSON.parse(row.record_json);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed subject record');
          return value;
        });
        return json(subjects);
      } catch (error) {
        console.error('Worker subject catalog read failed', error);
        return json({ error: 'Catalog unavailable' }, 500);
      }
    }


    // D1-backed subject catalog administration.
    if (url.pathname.startsWith('/api/worker/catalog/subjects') &&
        ['POST','PUT','DELETE'].includes(request.method)) {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>;
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(String(actor.role))) return json({error:'FORBIDDEN'},403);
        const subjectPermissions=actor.delegatedPermissions&&typeof actor.delegatedPermissions==='object'?actor.delegatedPermissions as Record<string,unknown>:{};
        if (String(actor.role)==='SchoolAdmin'&&subjectPermissions.canManageSubjects===false) return json({error:'FORBIDDEN_SUBJECT_MANAGEMENT'},403);
        const tail=url.pathname.slice('/api/worker/catalog/subjects'.length).replace(/^\/+/,'');
        if (request.method==='POST' && !tail) {
          const body:unknown=await request.json().catch(()=>null);
          if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid subject'},400);
          const input=body as Record<string,unknown>;
          if (typeof input.nameAr!=='string'||!input.nameAr.trim()||typeof input.nameEn!=='string'||!input.nameEn.trim()) return json({error:'Subject names are required'},400);
          const id=typeof input.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(input.id)?input.id:'subj-'+crypto.randomUUID();
          const subject={...input,id,code:typeof input.code==='string'?input.code:String(input.nameEn).slice(0,3).toUpperCase(),
            defaultDirection:input.defaultDirection==='ltr'?'ltr':'rtl',isActive:input.isActive!==false,
            sortOrder:Number.isFinite(Number(input.sortOrder))?Number(input.sortOrder):99,createdAt:new Date().toISOString()};
          const result=await env.DB.prepare('INSERT INTO subjects (id,is_active,sort_order,record_json) VALUES (?,?,?,?)')
            .bind(id,subject.isActive?1:0,subject.sortOrder,JSON.stringify(subject)).run();
          return result.success?json({success:true,subject}):json({error:'SUBJECT_SAVE_FAILED'},503);
        }
        const id=tail.split('/')[0];
        if (!id||! /^[A-Za-z0-9_-]{1,128}$/.test(id)) return json({error:'Invalid subject id'},400);
        const row=await env.DB.prepare('SELECT record_json FROM subjects WHERE id=? LIMIT 1').bind(id).first<{record_json:string}>();
        if (!row) return json({error:'SUBJECT_NOT_FOUND'},404);
        const existing=JSON.parse(row.record_json) as Record<string,unknown>;
        if (request.method==='DELETE') {
          if (['subj-quran','subj-isl','subj-ar','subj-sci','subj-soc','subj-en'].includes(id)) return json({error:'CORE_SUBJECT_CANNOT_BE_DELETED'},400);
          const removed=await env.DB.prepare('DELETE FROM subjects WHERE id=?').bind(id).run();
          return removed.success?json({success:true}):json({error:'SUBJECT_DELETE_FAILED'},503);
        }
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid subject update'},400);
        const patch=body as Record<string,unknown>;
        const {id:_id,...safe}=patch;
        const updated={...existing,...safe,id,isActive:safe.isActive===undefined?existing.isActive:safe.isActive!==false,
          sortOrder:safe.sortOrder===undefined?existing.sortOrder:Number(safe.sortOrder)};
        const saved=await env.DB.prepare('UPDATE subjects SET is_active=?,sort_order=?,record_json=? WHERE id=?')
          .bind(updated.isActive?1:0,Number(updated.sortOrder)||99,JSON.stringify(updated),id).run();
        return saved.success?json({success:true,subject:updated}):json({error:'SUBJECT_UPDATE_FAILED'},503);
      } catch(e) { console.error('Worker subject mutation failed',e); return json({error:'Subject operation failed'},500); }
    }

    // Curriculum units are stored as complete JSON records, retaining lesson structures.
    const curriculumCollection='/api/worker/curricula';
    const curriculumPrefix='/api/worker/curricula/unit/';
    if (url.pathname===curriculumCollection && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const grade=url.searchParams.get('grade')||'', subjectId=url.searchParams.get('subjectId')||'';
        const user=auth.user as Record<string,unknown>;
        const admin=['PlatformOwner','Administrator','SchoolAdmin'].includes(String(user.role));
        const grades=Array.isArray(user.assignedGrades)?user.assignedGrades.map(String):[];
        const subjects=Array.isArray(user.assignedSubjects)?user.assignedSubjects.map(String):[];
        if ((grade&& !admin && !(grades.includes('all')||grades.includes(grade))) ||
            (subjectId&& !admin && !(subjects.includes('all')||subjects.includes(subjectId)))) return json({error:'FORBIDDEN_ACADEMIC_SCOPE'},403);
        const existingCount=await env.DB.prepare('SELECT COUNT(*) AS total FROM curricula').first<{total:number}>();
        if (Number(existingCount?.total||0)===0) {
          for (const seedUnit of DEFAULT_CURRICULA) {
            const unit: Record<string,unknown>={...seedUnit,subjectId:typeof seedUnit.subjectId==='string'?seedUnit.subjectId:'subj-en'};
            await env.DB.prepare('INSERT OR IGNORE INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)')
              .bind(String(unit.id),String(unit.grade),String(unit.subjectId),JSON.stringify(unit)).run();
          }
        }
        const r=await env.DB.prepare('SELECT record_json FROM curricula ORDER BY grade, subject_id, id').all<{record_json:string}>();
        if (!r.success) return json({error:'Curriculum unavailable'},503);
        const list=(r.results||[]).flatMap(row=>{try{const v=JSON.parse(row.record_json) as Record<string,unknown>;
          if (grade&&v.grade!==grade) return [];
          if (subjectId&&String(v.subjectId||'subj-en')!==subjectId) return [];
          if (!admin && (!(grades.includes('all')||grades.includes(String(v.grade||''))) ||
              !(subjects.includes('all')||subjects.includes(String(v.subjectId||'subj-en'))))) return [];
          return [v];}catch{return[]}});
        return json(list);
      } catch(e) { console.error('Worker curricula read failed',e); return json({error:'Curriculum unavailable'},500); }
    }

    if (url.pathname===curriculumCollection+'/reset' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        if (String(auth.user.role)!=='PlatformOwner') return json({error:'FORBIDDEN'},403);
        const removed=await env.DB.prepare('DELETE FROM curricula').run();
        if (!removed.success) return json({error:'CURRICULUM_RESET_FAILED'},503);
        for (const seedUnit of DEFAULT_CURRICULA) {
          const unit: Record<string,unknown>={...seedUnit,subjectId:typeof seedUnit.subjectId==='string'?seedUnit.subjectId:'subj-en'};
          const inserted=await env.DB.prepare('INSERT INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)')
            .bind(String(unit.id),String(unit.grade),String(unit.subjectId),JSON.stringify(unit)).run();
          if (!inserted.success) return json({error:'CURRICULUM_RESET_PARTIAL'},503);
        }
        return json({success:true,message:'Curriculum restored to the canonical starter dataset'});
      } catch(e) { console.error('Worker curriculum reset failed',e); return json({error:'Curriculum reset failed'},500); }
    }

    if (url.pathname===curriculumCollection+'/unit' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const curriculumActor=auth.user as Record<string,unknown>;
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(String(curriculumActor.role))) return json({error:'FORBIDDEN'},403);
        const curriculumPermissions=curriculumActor.delegatedPermissions&&typeof curriculumActor.delegatedPermissions==='object'?curriculumActor.delegatedPermissions as Record<string,unknown>:{};
        if (String(curriculumActor.role)==='SchoolAdmin'&&curriculumPermissions.canManageCurricula===false) return json({error:'FORBIDDEN_CURRICULUM_MANAGEMENT'},403);
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid curriculum unit'},400);
        const input=body as Record<string,unknown>;
        if (typeof input.title!=='string'||!input.title.trim()||typeof input.grade!=='string'||!input.grade.trim()) return json({error:'Title and grade are required'},400);
        const id=typeof input.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(input.id)?input.id:'unit-'+crypto.randomUUID();
        const unit: Record<string,unknown>={...input,id,lessons:Array.isArray(input.lessons)?input.lessons:[]};
        const r=await env.DB.prepare('INSERT INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)')
          .bind(id,String(unit.grade),String(unit.subjectId||'subj-en'),JSON.stringify(unit)).run();
        return r.success?json({success:true,unit}):json({error:'CURRICULUM_SAVE_FAILED'},503);
      } catch(e) { console.error('Worker curriculum create failed',e); return json({error:'Curriculum save failed'},500); }
    }
    const curriculumId= url.pathname.startsWith(curriculumPrefix)?url.pathname.slice(curriculumPrefix.length):'';
    if (curriculumId && /^[A-Za-z0-9_-]{1,128}$/.test(curriculumId) && ['PUT','DELETE'].includes(request.method)) {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const curriculumActor=auth.user as Record<string,unknown>;
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(String(curriculumActor.role))) return json({error:'FORBIDDEN'},403);
        const curriculumPermissions=curriculumActor.delegatedPermissions&&typeof curriculumActor.delegatedPermissions==='object'?curriculumActor.delegatedPermissions as Record<string,unknown>:{};
        if (String(curriculumActor.role)==='SchoolAdmin'&&curriculumPermissions.canManageCurricula===false) return json({error:'FORBIDDEN_CURRICULUM_MANAGEMENT'},403);
        const row=await env.DB.prepare('SELECT record_json FROM curricula WHERE id=? LIMIT 1').bind(curriculumId).first<{record_json:string}>();
        if (!row) return json({error:'CURRICULUM_NOT_FOUND'},404);
        if (request.method==='DELETE') {
          const d=await env.DB.prepare('DELETE FROM curricula WHERE id=?').bind(curriculumId).run();
          return d.success?json({success:true}):json({error:'CURRICULUM_DELETE_FAILED'},503);
        }
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid curriculum update'},400);
        const current=JSON.parse(row.record_json) as Record<string,unknown>;
        const patch=body as Record<string,unknown>;
        const {id:_id,...safe}=patch;
        const next: Record<string,unknown>={...current,...safe,id:curriculumId};
        const nextGrade=typeof next.grade==='string'?next.grade:'';
        const nextSubject=typeof next.subjectId==='string'&&next.subjectId?next.subjectId:'subj-en';
        if (!nextGrade.trim()) return json({error:'Invalid curriculum grade'},400);
        const u=await env.DB.prepare('UPDATE curricula SET grade=?,subject_id=?,record_json=? WHERE id=?')
          .bind(nextGrade,nextSubject,JSON.stringify(next),curriculumId).run();
        return u.success?json({success:true,unit:next}):json({error:'CURRICULUM_UPDATE_FAILED'},503);
      } catch(e) { console.error('Worker curriculum mutation failed',e); return json({error:'Curriculum operation failed'},500); }
    }

    // User-scoped notification reads and read-state updates.
    if (url.pathname==='/api/worker/notifications' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const r=await env.DB.prepare('SELECT id,record_json FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 200')
          .bind(auth.user.id).all<{id:string;record_json:string}>();
        if (!r.success) return json({error:'Notifications unavailable'},503);
        const list=(r.results||[]).flatMap(row=>{try{const n=JSON.parse(row.record_json) as Record<string,unknown>;
          const readBy=Array.isArray(n.readBy)?n.readBy.map(String):[];
          return [{...n,readBy}];}catch{return[]}});
        return json({notifications:list,unreadCount:list.filter(n=>!(n.readBy as string[]).includes(String(auth.user.id))).length});
      } catch(e) { console.error('Worker notifications read failed',e); return json({error:'Notifications unavailable'},500); }
    }
    const notificationReadMatch=url.pathname.match(/^\/api\/worker\/notifications\/([A-Za-z0-9_-]{1,128})\/read$/);
    if (notificationReadMatch && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const id=notificationReadMatch[1];
        const row=await env.DB.prepare('SELECT record_json FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL) LIMIT 1')
          .bind(id,auth.user.id).first<{record_json:string}>();
        if (!row) return json({error:'NOTIFICATION_NOT_FOUND'},404);
        const n=JSON.parse(row.record_json) as Record<string,unknown>;
        const readBy=Array.isArray(n.readBy)?n.readBy.map(String):[];
        if (!readBy.includes(String(auth.user.id))) readBy.push(String(auth.user.id));
        n.readBy=readBy;
        const u=await env.DB.prepare('UPDATE notifications SET record_json=? WHERE id=?').bind(JSON.stringify(n),id).run();
        return u.success?json({success:true}):json({error:'NOTIFICATION_UPDATE_FAILED'},503);
      } catch(e) { console.error('Worker notification read update failed',e); return json({error:'Notification update failed'},500); }
    }
    if (url.pathname==='/api/worker/notifications/read-all' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const r=await env.DB.prepare('SELECT id,record_json FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 200')
          .bind(auth.user.id).all<{id:string;record_json:string}>();
        let updatedCount=0;
        for (const row of r.results||[]) {
          try {const n=JSON.parse(row.record_json) as Record<string,unknown>;const reads=Array.isArray(n.readBy)?n.readBy.map(String):[];
            if (!reads.includes(String(auth.user.id))) {reads.push(String(auth.user.id));n.readBy=reads;
              const u=await env.DB.prepare('UPDATE notifications SET record_json=? WHERE id=?').bind(JSON.stringify(n),row.id).run();
              if (u.success) updatedCount++;}}
          catch {/* Ignore malformed notification and continue. */}
        }
        return json({success:true,updatedCount});
      } catch(e) { console.error('Worker mark all notifications failed',e); return json({error:'Notifications unavailable'},500); }
    }

    if (url.pathname==='/api/worker/school/identity' && request.method==='PUT') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>;
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(String(actor.role))) return json({error:'FORBIDDEN'},403);
        const identityPermissions=actor.delegatedPermissions&&typeof actor.delegatedPermissions==='object'?actor.delegatedPermissions as Record<string,unknown>:{};
        if (String(actor.role)==='SchoolAdmin'&&identityPermissions.canManageIdentity===false) return json({error:'FORBIDDEN_IDENTITY_MANAGEMENT'},403);
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid school identity'},400);
        const current=await env.DB.prepare('SELECT record_json FROM school_settings WHERE singleton_id=1').first<{record_json:string}>();
        const old=current?JSON.parse(current.record_json) as Record<string,unknown>:{};
        const patch=body as Record<string,unknown>;
        const next={...old,...patch,updatedAt:new Date().toISOString()};
        const saved=await env.DB.prepare('INSERT INTO school_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at')
          .bind(JSON.stringify(next),String(next.updatedAt)).run();
        return saved.success?json({success:true,settings:next}):json({error:'SCHOOL_IDENTITY_SAVE_FAILED'},503);
      } catch(e) { console.error('Worker school identity update failed',e); return json({error:'School identity update failed'},500); }
    }

    if (url.pathname === '/api/worker/school/identity' && request.method === 'GET') {
      if (!env.DB) return json({ error: 'School identity unavailable' }, 503);
      try {
        const row = await env.DB.prepare('SELECT record_json FROM school_settings WHERE singleton_id = 1')
          .first<{ record_json: string }>();
        const defaults = {
          schoolNameAr: 'مدرسة قفلة للتعليم الأساسي',
          schoolNameEn: 'QAFLAH SCHOOL',
          countryTitleAr: 'الجمهورية اليمنية',
          countryTitleEn: 'Republic of Yemen',
          ministryTitleAr: 'وزارة التربية والتعليم',
          ministryTitleEn: 'Ministry of Education',
          logoUrl: '/assets/aistudio/1793675145730_f04991e4.jpg',
          primaryColor: '#1B5E3A',
          defaultAcademicYear: '2026 / 2027',
          defaultTerm: 'الفصل الدراسي الأول',
          defaultShowTeacherName: true,
          defaultHeaderLanguage: 'ar',
          defaultHeaderCompact: false,
          footerNoteAr: 'مدرسة قفلة للتعليم الأساسي – الجمهورية اليمنية',
          footerNoteEn: 'QAFLAH BASIC EDUCATION SCHOOL - YEMEN',
        };
        if (!row) return json(defaults);
        const stored: unknown = JSON.parse(row.record_json);
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Malformed school identity');
        return json({ ...defaults, ...(stored as Record<string, unknown>) });
      } catch (error) {
        console.error('Worker school identity read failed', error);
        return json({ error: 'School identity unavailable' }, 500);
      }
    }



    // D1-backed user administration with explicit privilege boundaries.
    const userCollection='/api/worker/system/users';
    if ((url.pathname===userCollection || url.pathname==='/api/worker/system/colleagues') &&
        request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>;
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(String(actor.role))) return json({error:'FORBIDDEN'},403);
        const userPermissions=actor.delegatedPermissions&&typeof actor.delegatedPermissions==='object'?actor.delegatedPermissions as Record<string,unknown>:{};
        if (String(actor.role)==='SchoolAdmin'&&userPermissions.canManageTeachers===false) return json({error:'FORBIDDEN_USER_MANAGEMENT'},403);
        const r=await env.DB.prepare('SELECT record_json FROM app_users ORDER BY created_at').all<{record_json:string}>();
        if (!r.success) return json({error:'User directory unavailable'},503);
        const users=(r.results||[]).flatMap(row=>{try{const value=JSON.parse(row.record_json) as Record<string,unknown>;
          const {passwordHash:_passwordHash,authVersion:_authVersion,...safe}=value;
          return [url.pathname.endsWith('/colleagues')?{id:safe.id,name:safe.name,username:safe.username,role:safe.role}:safe];
        }catch{return[]}});
        return json(users);
      } catch(e) { console.error('Worker user directory failed',e); return json({error:'User directory unavailable'},500); }
    }
    if (url.pathname===userCollection && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>;
        const role=String(actor.role);
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(role)) return json({error:'FORBIDDEN'},403);
        const userPermissions=actor.delegatedPermissions&&typeof actor.delegatedPermissions==='object'?actor.delegatedPermissions as Record<string,unknown>:{};
        if (role==='SchoolAdmin'&&userPermissions.canManageTeachers===false) return json({error:'FORBIDDEN_USER_MANAGEMENT'},403);
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid user data'},400);
        const input=body as Record<string,unknown>;
        const username=typeof input.username==='string'?input.username.trim():'';
        const name=typeof input.name==='string'?input.name.trim():'';
        const password=typeof input.password==='string'?input.password:'';
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)||name.length<3||name.length>120||password.length<8||password.length>128) return json({error:'Invalid username, name, or password'},400);
        const requested=input.role==='PlatformOwner'?'PlatformOwner':input.role==='Administrator'?'Administrator':input.role==='SchoolAdmin'?'SchoolAdmin':'Teacher';
        if (['PlatformOwner','Administrator','SchoolAdmin'].includes(requested) && role!=='PlatformOwner') return json({error:'Only the platform owner may create privileged accounts'},403);
        const subjects=Array.isArray(input.assignedSubjects)?input.assignedSubjects.filter((x):x is string=>typeof x==='string'):[];
        const grades=Array.isArray(input.assignedGrades)?input.assignedGrades.filter((x):x is string=>typeof x==='string'):[];
        if (requested==='Teacher') {
          const [subjectRows]=await Promise.all([env.DB.prepare('SELECT record_json FROM subjects WHERE is_active=1').all<{record_json:string}>()]);
          const valid=new Set((subjectRows.results||[]).flatMap(row=>{try{return [String((JSON.parse(row.record_json) as Record<string,unknown>).id)]}catch{return[]}}));
          if (!subjects.length||subjects.includes('all')||!subjects.every(x=>valid.has(x))||
              !grades.length||grades.includes('all')||!grades.every(x=>/^Grade [1-9]$/.test(x))) return json({error:'Invalid teacher assignments'},400);
        }
        const existing=await env.DB.prepare('SELECT id FROM app_users WHERE username=? COLLATE NOCASE LIMIT 1').bind(username).first<{id:string}>();
        if (existing) return json({error:'USERNAME_ALREADY_EXISTS'},409);
        const schoolRow=await env.DB.prepare('SELECT record_json FROM school_settings WHERE singleton_id=1').first<{record_json:string}>();
        const school=schoolRow?(JSON.parse(schoolRow.record_json) as Record<string,unknown>):{};
        const now=new Date().toISOString(), id='usr-'+crypto.randomUUID();
        const user:Record<string,unknown>={id,username,name,role:requested,status:'ACTIVE',
          hasAIAccess:role==='PlatformOwner'&&requested==='PlatformOwner'&&input.hasAIAccess===true,
          assignedSubjects:requested==='Teacher'?subjects:['all'],assignedGrades:requested==='Teacher'?grades:['all'],
          email:typeof input.email==='string'?input.email.slice(0,254):undefined,phone:typeof input.phone==='string'?input.phone.slice(0,40):undefined,
          school:typeof school.schoolNameAr==='string'?school.schoolNameAr:'مدرسة قفلة للتعليم الأساسي',
          reviewedBy:actor.id,reviewedByName:actor.name,reviewedAt:now,createdAt:now,passwordHash:await bcrypt.hash(password,10),authVersion:0};
        const inserted=await env.DB.prepare('INSERT INTO app_users (id,username,role,status,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
          .bind(id,username,requested,'ACTIVE',JSON.stringify(user),now,now).run();
        if (!inserted.success) return json({error:'USER_CREATE_FAILED'},503);
        const {passwordHash:_hash,authVersion:_version,...safe}=user;
        return json({success:true,user:safe});
      } catch(e) { console.error('Worker user create failed',e); return json({error:'User creation failed'},500); }
    }
    const userItemPrefix='/api/worker/system/users/';
    const userItemId=url.pathname.startsWith(userItemPrefix)?url.pathname.slice(userItemPrefix.length):'';
    if (userItemId && /^[A-Za-z0-9_-]{1,128}$/.test(userItemId) && request.method==='PUT') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>, actorRole=String(actor.role);
        if (!['PlatformOwner','Administrator','SchoolAdmin'].includes(actorRole)) return json({error:'FORBIDDEN'},403);
        const userPermissions=actor.delegatedPermissions&&typeof actor.delegatedPermissions==='object'?actor.delegatedPermissions as Record<string,unknown>:{};
        if (actorRole==='SchoolAdmin'&&userPermissions.canManageTeachers===false) return json({error:'FORBIDDEN_USER_MANAGEMENT'},403);
        const row=await env.DB.prepare('SELECT record_json FROM app_users WHERE id=? LIMIT 1').bind(userItemId).first<{record_json:string}>();
        if (!row) return json({error:'USER_NOT_FOUND'},404);
        const target=JSON.parse(row.record_json) as Record<string,unknown>;
        if (['PlatformOwner','Administrator'].includes(String(target.role)) && actorRole!=='PlatformOwner') return json({error:'OWNER_ACCOUNT_PROTECTED'},403);
        if (actorRole==='SchoolAdmin'&&String(target.role)!=='Teacher') return json({error:'SCHOOL_ADMIN_CAN_ONLY_MANAGE_TEACHERS'},403);
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid user update'},400);
        const input=body as Record<string,unknown>, allowed=['name','role','status','hasAIAccess','assignedSubjects','assignedGrades','email','phone','school','reviewNotes','delegatedPermissions'];
        const patch:Record<string,unknown>={};
        for (const key of allowed) if (Object.prototype.hasOwnProperty.call(input,key)) patch[key]=input[key];
        if (actorRole!=='PlatformOwner') {
          delete patch.hasAIAccess;delete patch.delegatedPermissions;delete patch.status;
          if (patch.role==='PlatformOwner'||patch.role==='Administrator'||(patch.role==='SchoolAdmin'&&target.role!=='SchoolAdmin')) return json({error:'PRIVILEGE_ESCALATION_BLOCKED'},403);
        }
        const nextRole=String(patch.role||target.role);
        if (nextRole==='Teacher') {
          const subjects=Array.isArray(patch.assignedSubjects)?patch.assignedSubjects:target.assignedSubjects;
          const grades=Array.isArray(patch.assignedGrades)?patch.assignedGrades:target.assignedGrades;
          if (!Array.isArray(subjects)||!subjects.length||subjects.includes('all')||!Array.isArray(grades)||!grades.length||grades.includes('all')||!grades.every(x=>typeof x==='string'&&/^Grade [1-9]$/.test(x))) return json({error:'Invalid teacher assignments'},400);
          patch.hasAIAccess=false;
        }
        const updated: Record<string,unknown>={...target,...patch,id:userItemId,updatedAt:new Date().toISOString()};
        const saved=await env.DB.prepare('UPDATE app_users SET role=?,status=?,record_json=?,updated_at=? WHERE id=?')
          .bind(String(updated.role),String(updated.status),JSON.stringify(updated),String(updated.updatedAt),userItemId).run();
        if (!saved.success) return json({error:'USER_UPDATE_FAILED'},503);
        const {passwordHash:_hash,authVersion:_version,...safe}=updated;
        return json({success:true,user:safe});
      } catch(e) { console.error('Worker user update failed',e); return json({error:'User update failed'},500); }
    }



    const aiModels=[
      {id:'gemini-3.8-flash',name:'Gemini 3.8 Flash (الموديل الموصى به)',isFreeTier:true,description:'سريع لتوليد وفحص الاختبارات المدرسية.'},
      {id:'gemini-3.1-flash-lite',name:'Gemini 3.1 Flash Lite (الاحتياطي السريع)',isFreeTier:true,description:'خيار احتياطي سريع واقتصادي.'}
    ];
    const aiDefaults={apiKeyConfigured:Boolean(env.GEMINI_API_KEY),primaryModel:'gemini-3.8-flash',fallbackModel:'gemini-3.1-flash-lite',
      allowPaidModels:false,temperature:0.3,totalRequests:0,activeStatus:env.GEMINI_API_KEY?'Configured':'NotConfigured'};
    const aiAccess=async (request:Request) => {
      const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
      if (!auth.ok) return {auth,allowed:false,userId:''};
      const user=auth.user as Record<string,unknown>;
      return {auth,allowed:user.hasAIAccess===true&&['PlatformOwner','Administrator'].includes(String(user.role)),userId:String(user.id)};
    };
    const readAISettings=async () => {
      const row=await env.DB.prepare('SELECT record_json FROM ai_settings WHERE singleton_id=1').first<{record_json:string}>();
      let stored:Record<string,unknown>={};
      if (row) {try {stored=JSON.parse(row.record_json) as Record<string,unknown>}catch{/* use defaults */}}
      return {...aiDefaults,...stored,apiKeyConfigured:Boolean(env.GEMINI_API_KEY)};
    };
    const writeAILog=async (userId:string,operation:string,model:string,status:string,promptSnippet:string,durationMs:number,errorMessage?:string) => {
      const createdAt=new Date().toISOString(),id='ai-log-'+crypto.randomUUID();
      const log={id,timestamp:createdAt,userId,operation,model,status,promptSnippet:promptSnippet.slice(0,500),durationMs,errorMessage:errorMessage?.slice(0,500)};
      await env.DB.prepare('INSERT INTO ai_usage_logs (id,user_id,created_at,record_json) VALUES (?,?,?,?)')
        .bind(id,userId,createdAt,JSON.stringify(log)).run();
      const settings=await readAISettings();
      settings.totalRequests=Number(settings.totalRequests||0)+1;
      await env.DB.prepare('INSERT INTO ai_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at')
        .bind(JSON.stringify(settings),createdAt).run();
    };
    const generateGemini=async (model:string,prompt:string,temperature=0.3) => {
      if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
      const endpoint='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(env.GEMINI_API_KEY);
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',temperature}})});
      const payload:unknown=await response.json().catch(()=>null);
      if (!response.ok) throw new Error('Gemini request failed with status '+response.status);
      const candidates=(payload as Record<string,unknown>)?.candidates;
      const first=Array.isArray(candidates)?candidates[0] as Record<string,unknown>:null;
      const content=first?.content as Record<string,unknown>|undefined;
      const parts=Array.isArray(content?.parts)?content?.parts as Array<Record<string,unknown>>:[];
      const textValue=parts.map(p=>typeof p.text==='string'?p.text:'').join('');
      if (!textValue) throw new Error('Gemini returned an empty response');
      return textValue;
    };
    if (url.pathname==='/api/worker/ai/settings' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      try {return json(await readAISettings());} catch(e) {console.error('AI settings read failed',e);return json({error:'AI settings unavailable'},500);}
    }
    if (url.pathname==='/api/worker/ai/settings' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      try {
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid AI settings'},400);
        const input=body as Record<string,unknown>, current=await readAISettings(), patch:Record<string,unknown>={};
        const allowedModels=new Set(aiModels.map(m=>m.id));
        if (input.primaryModel!==undefined) {if(typeof input.primaryModel!=='string'||!allowedModels.has(input.primaryModel)) return json({error:'INVALID_PRIMARY_MODEL'},400);patch.primaryModel=input.primaryModel;}
        if (input.fallbackModel!==undefined) {if(typeof input.fallbackModel!=='string'||!allowedModels.has(input.fallbackModel)) return json({error:'INVALID_FALLBACK_MODEL'},400);patch.fallbackModel=input.fallbackModel;}
        if (input.allowPaidModels!==undefined) {if(typeof input.allowPaidModels!=='boolean') return json({error:'INVALID_MODEL_POLICY'},400);patch.allowPaidModels=input.allowPaidModels;}
        if (input.temperature!==undefined) {const n=Number(input.temperature);if(!Number.isFinite(n)||n<0||n>2)return json({error:'INVALID_TEMPERATURE'},400);patch.temperature=n;}
        const next={...current,...patch,apiKeyConfigured:Boolean(env.GEMINI_API_KEY)};
        const at=new Date().toISOString();
        const saved=await env.DB.prepare('INSERT INTO ai_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at')
          .bind(JSON.stringify(next),at).run();
        return saved.success?json({success:true,settings:next}):json({error:'AI_SETTINGS_SAVE_FAILED'},503);
      } catch(e) {console.error('AI settings update failed',e);return json({error:'AI settings update failed'},500);}
    }
    if (url.pathname==='/api/worker/ai/models' && request.method==='GET') {
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      return check.allowed?json(aiModels):json({error:'AI_ACCESS_REQUIRED'},403);
    }
    if (url.pathname==='/api/worker/ai/logs' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      const r=await env.DB.prepare('SELECT record_json FROM ai_usage_logs ORDER BY created_at DESC LIMIT 200').all<{record_json:string}>();
      return r.success?json((r.results||[]).flatMap(row=>{try{return [JSON.parse(row.record_json)]}catch{return[]}})):json({error:'AI logs unavailable'},503);
    }
    if (url.pathname==='/api/worker/ai/ping' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      if (!env.GEMINI_API_KEY) return json({success:false,model:'none',latencyMs:0,message:'GEMINI_API_KEY is not configured'},503);
      const body:unknown=await request.json().catch(()=>({}));
      const model=body&&typeof body==='object'&&typeof (body as Record<string,unknown>).model==='string'?String((body as Record<string,unknown>).model):String((await readAISettings()).primaryModel);
      if (!aiModels.some(m=>m.id===model)) return json({error:'MODEL_NOT_ALLOWED'},400);
      const started=Date.now();
      try {
        await generateGemini(model,'Reply only as JSON: {"status":"connected","service":"Gemini"}',0);
        const latencyMs=Date.now()-started;
        await writeAILog(check.userId,'PING_TEST',model,'SUCCESS','Connection test',latencyMs);
        return json({success:true,model,latencyMs,message:'Gemini connection successful'});
      } catch(e) {
        const latencyMs=Date.now()-started;
        await writeAILog(check.userId,'PING_TEST',model,'ERROR','Connection test',latencyMs,String(e));
        return json({success:false,model,latencyMs,message:'Gemini connection failed'},502);
      }
    }
    if (url.pathname==='/api/worker/questions/generate' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      const body:unknown=await request.json().catch(()=>null);
      if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid question request'},400);
      const input=body as Record<string,unknown>;
      const grade=typeof input.grade==='string'?input.grade:'Grade 9';
      const type=typeof input.type==='string'?input.type:'Multiple Choice';
      const subjectId=typeof input.subjectId==='string'?input.subjectId:'subj-en';
      if (subjectId==='subj-quran'||type.startsWith('Quran')) return json({error:'AI generation is disabled for Quranic text'},400);
      const unitTitle=typeof input.unitTitle==='string'?input.unitTitle:'Unit 1: General';
      const model=String((await readAISettings()).primaryModel||aiModels[0].id);
      const started=Date.now();
      const prompt='You are an expert Yemeni basic education English examiner. Generate one clear exam question as JSON only. Grade: '+grade+'. Unit: '+unitTitle+'. Type: '+type+'. Difficulty: '+String(input.difficulty||'Medium')+'. Marks: '+String(input.marks||2)+'. Focus: '+String(input.lessonFocus||'').slice(0,500)+'. Return keys questionText, instructions, options (only for multiple choice), matchingPairs (only for matching), passage, scrambledWords, modelAnswer, explanation. Use exactly one unambiguous answer.';
      try {
        const raw=await generateGemini(model,prompt,Number((await readAISettings()).temperature)||0.3);
        const parsed=JSON.parse(raw) as Record<string,unknown>;
        if (typeof parsed.questionText!=='string'||typeof parsed.modelAnswer!=='string') throw new Error('Gemini response schema is invalid');
        const question={...parsed,id:'q-gen-'+crypto.randomUUID(),grade,unitId:'gen-unit',unitTitle,type,
          difficulty:String(input.difficulty||'Medium'),marks:Number(input.marks)||2,
          sourceCode:String(input.sourceCode||'CURRICULUM'),educationalLevel:String(input.educationalLevel||'BASIC'),
          grammarCategory:typeof input.grammarCategory==='string'?input.grammarCategory:undefined,
          source:'Gemini AI',ownerId:check.userId,createdAt:new Date().toISOString()};
        await writeAILog(check.userId,'GENERATE_QUESTION',model,'SUCCESS','Generate '+type+' for '+grade,Date.now()-started);
        return json({success:true,question,modelUsed:model});
      } catch(e) {
        await writeAILog(check.userId,'GENERATE_QUESTION',model,'ERROR','Generate '+type+' for '+grade,Date.now()-started,String(e));
        return json({error:'Question generation failed'},502);
      }
    }

    // Owner-isolated reusable layout templates and analyzed source documents.
    if (url.pathname==='/api/worker/layout-templates' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
      if (!auth.ok) return json({error:auth.error},auth.status);
      const r=await env.DB.prepare('SELECT record_json FROM layout_templates WHERE owner_id=? ORDER BY created_at DESC')
        .bind(String(auth.user.id)).all<{record_json:string}>();
      return r.success?json((r.results||[]).flatMap(row=>{try{return [JSON.parse(row.record_json)]}catch{return[]}})):json({error:'Layout templates unavailable'},503);
    }
    if (url.pathname==='/api/worker/layout-templates' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
      if (!auth.ok) return json({error:auth.error},auth.status);
      const body:unknown=await request.json().catch(()=>null);
      if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid layout template'},400);
      const input=body as Record<string,unknown>;
      if (typeof input.name!=='string'||!input.name.trim()||typeof input.nameAr!=='string'||!input.nameAr.trim()||!input.layoutConfig||typeof input.layoutConfig!=='object') return json({error:'Template name and layout configuration are required'},400);
      const id=typeof input.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(input.id)?input.id:'layout-'+crypto.randomUUID();
      const template={...input,id,ownerId:String(auth.user.id),createdAt:new Date().toISOString()};
      const saved=await env.DB.prepare('INSERT INTO layout_templates (id,owner_id,record_json,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json')
        .bind(id,String(auth.user.id),JSON.stringify(template),String(template.createdAt)).run();
      return saved.success?json({success:true,template}):json({error:'LAYOUT_TEMPLATE_SAVE_FAILED'},503);
    }
    const layoutIdMatch=url.pathname.match(/^\/api\/worker\/layout-templates\/([A-Za-z0-9_-]{1,128})$/);
    if (layoutIdMatch && request.method==='DELETE') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
      if (!auth.ok) return json({error:auth.error},auth.status);
      const removed=await env.DB.prepare('DELETE FROM layout_templates WHERE id=? AND owner_id=?').bind(layoutIdMatch[1],String(auth.user.id)).run();
      return removed.success?json({success:true}):json({error:'LAYOUT_TEMPLATE_DELETE_FAILED'},503);
    }

    if (url.pathname==='/api/worker/documents' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      const r=await env.DB.prepare('SELECT record_json FROM analyzed_documents WHERE owner_id=? ORDER BY created_at DESC')
        .bind(check.userId).all<{record_json:string}>();
      return r.success?json((r.results||[]).flatMap(row=>{try{return [JSON.parse(row.record_json)]}catch{return[]}})):json({error:'Documents unavailable'},503);
    }
    if (url.pathname==='/api/worker/documents' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      const length=Number(request.headers.get('Content-Length')||0);
      if (length>10_000_000) return json({error:'Document is too large'},413);
      const body:unknown=await request.json().catch(()=>null);
      if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid document'},400);
      const input=body as Record<string,unknown>;
      if (typeof input.title!=='string'||!input.title.trim()) return json({error:'Document title is required'},400);
      const id=typeof input.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(input.id)?input.id:'doc-'+crypto.randomUUID();
      const document={...input,id,ownerId:check.userId,createdAt:new Date().toISOString()};
      const saved=await env.DB.prepare('INSERT INTO analyzed_documents (id,owner_id,record_json,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json')
        .bind(id,check.userId,JSON.stringify(document),String(document.createdAt)).run();
      return saved.success?json({success:true,document}):json({error:'DOCUMENT_SAVE_FAILED'},503);
    }
    const documentIdMatch=url.pathname.match(/^\/api\/worker\/documents\/([A-Za-z0-9_-]{1,128})$/);
    if (documentIdMatch && ['GET','DELETE'].includes(request.method)) {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await aiAccess(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.allowed) return json({error:'AI_ACCESS_REQUIRED'},403);
      if (request.method==='GET') {
        const row=await env.DB.prepare('SELECT record_json FROM analyzed_documents WHERE id=? AND owner_id=? LIMIT 1')
          .bind(documentIdMatch[1],check.userId).first<{record_json:string}>();
        return row?json(JSON.parse(row.record_json)):json({error:'DOCUMENT_NOT_FOUND'},404);
      }
      const removed=await env.DB.prepare('DELETE FROM analyzed_documents WHERE id=? AND owner_id=?')
        .bind(documentIdMatch[1],check.userId).run();
      return removed.success?json({success:true}):json({error:'DOCUMENT_DELETE_FAILED'},503);
    }

    const backupTables=['app_users','registration_requests','notifications','subjects','school_settings','curricula','questions','exams','archived_exams','layout_templates','analyzed_documents','ai_settings','ai_usage_logs','audit_logs','question_images','auth_rate_limits','app_migrations'];
    const isPlatformOwner=async (request:Request) => {
      const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
      if (!auth.ok) return {auth,ownerId:'',isOwner:false};
      return {auth,ownerId:String(auth.user.id),isOwner:String(auth.user.role)==='PlatformOwner'};
    };
    const makeBackup=async (ownerId:string) => {
      if (!env.QUESTION_IMAGES) throw new Error('Private R2 bucket binding is missing');
      const tables:Record<string,unknown[]>={};
      for (const table of backupTables) {
        const result=await env.DB.prepare('SELECT * FROM '+table).all<Record<string,unknown>>();
        if (!result.success) throw new Error('Could not read table '+table);
        tables[table]=result.results||[];
      }
      const createdAt=new Date().toISOString(),id='backup-'+crypto.randomUUID();
      const snapshot={format:'ABU_HUSSAM_D1_BACKUP_V1',createdAt,tables};
      const plain=new TextEncoder().encode(JSON.stringify(snapshot));
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.SESSION_SECRET));
      const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
      const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
      const ivHex=Array.from(iv,x=>x.toString(16).padStart(2,'0')).join('');
      const filename='abu-hussam-backup-'+createdAt.replace(/[:.]/g,'-')+'-'+id.slice(-8)+'.json.enc';
      const objectKey='backups/'+id+'.bin';
      await env.QUESTION_IMAGES.put(objectKey,encrypted,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{backupId:id,createdBy:ownerId}});
      const record={id,filename,objectKey,byteSize:encrypted.byteLength,ivHex,createdBy:ownerId,createdAt};
      const saved=await env.DB.prepare('INSERT INTO backup_metadata (id,filename,object_key,byte_size,iv_hex,created_by,created_at,record_json) VALUES (?,?,?,?,?,?,?,?)')
        .bind(id,filename,objectKey,encrypted.byteLength,ivHex,ownerId,createdAt,JSON.stringify(record)).run();
      if (!saved.success) { await env.QUESTION_IMAGES.delete(objectKey).catch(()=>undefined); throw new Error('Backup metadata could not be stored'); }
      return record;
    };
    const readBackup=async (record:Record<string,unknown>) => {
      if (!env.QUESTION_IMAGES) throw new Error('Private R2 bucket binding is missing');
      const object=await env.QUESTION_IMAGES.get(String(record.object_key));
      if (!object) throw new Error('Backup object is missing from R2');
      const encrypted=await object.arrayBuffer();
      const ivText=String(record.iv_hex||'');
      if (!/^[a-f0-9]{24}$/.test(ivText)) throw new Error('Backup encryption metadata is invalid');
      const iv=new Uint8Array(ivText.match(/.{2}/g)!.map(x=>parseInt(x,16)));
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.SESSION_SECRET));
      const key=await crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']);
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,encrypted);
      const parsed:unknown=JSON.parse(new TextDecoder().decode(plain));
      if (!parsed||typeof parsed!=='object'||(parsed as Record<string,unknown>).format!=='ABU_HUSSAM_D1_BACKUP_V1') throw new Error('Backup format is invalid');
      return plain;
    };

    if (url.pathname==='/api/worker/system/storage-status' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      try {
        const [users,questions,exams,images,backups]=await Promise.all([
          env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first<{total:number}>(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM questions').first<{total:number}>(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM exams').first<{total:number}>(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM question_images').first<{total:number}>(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM backup_metadata').first<{total:number}>()
        ]);
        return json({database:'D1',r2Configured:Boolean(env.QUESTION_IMAGES),users:Number(users?.total||0),
          questions:Number(questions?.total||0),exams:Number(exams?.total||0),questionImages:Number(images?.total||0),backups:Number(backups?.total||0)});
      } catch(e) { console.error('Worker storage status failed',e); return json({error:'Storage status unavailable'},500); }
    }

    const restoreSnapshot=async (snapshot:unknown) => {
      if (!snapshot||typeof snapshot!=='object'||(snapshot as Record<string,unknown>).format!=='ABU_HUSSAM_D1_BACKUP_V1') throw new Error('Backup format is invalid');
      const tables=(snapshot as Record<string,unknown>).tables;
      if (!tables||typeof tables!=='object'||Array.isArray(tables)) throw new Error('Backup tables are invalid');
      if (!env.DB.batch) throw new Error('Transactional D1 batch is unavailable');
      const columns:Record<string,string[]> = {
        app_users:['id','username','role','status','record_json','created_at','updated_at'],
        registration_requests:['id','username','status','record_json','created_at','updated_at'],
        notifications:['id','user_id','record_json','created_at'],
        subjects:['id','is_active','sort_order','record_json'],
        school_settings:['singleton_id','record_json','updated_at'],
        curricula:['id','grade','subject_id','record_json'],
        questions:['id','owner_id','subject_id','grade','unit_id','record_json','created_at','updated_at'],
        exams:['id','owner_id','subject_id','grade','status','record_json','created_at','updated_at'],
        archived_exams:['id','owner_id','subject_id','grade','status','record_json','archived_at'],
        layout_templates:['id','owner_id','record_json','created_at'],
        analyzed_documents:['id','owner_id','record_json','created_at'],
        ai_settings:['singleton_id','record_json','updated_at'],
        ai_usage_logs:['id','user_id','created_at','record_json'],
        audit_logs:['id','user_id','timestamp','prev_hash','entry_hash','record_json'],
        question_images:['id','owner_id','question_id','object_key','content_type','byte_size','checksum_sha256','record_json','created_at'],
        auth_rate_limits:['bucket_key','window_started_at','attempts','locked_until'],
        app_migrations:['version','applied_at','checksum']
      };
      const source=tables as Record<string,unknown>;
      const statements:D1PreparedStatement[]=[];
      for (const table of backupTables) {
        const rows=source[table];
        if (!Array.isArray(rows)) throw new Error('Backup is missing table '+table);
        const names=columns[table];
        statements.push(env.DB.prepare('DELETE FROM '+table));
        for (const item of rows) {
          if (!item||typeof item!=='object'||Array.isArray(item)) throw new Error('Malformed row in '+table);
          const row=item as Record<string,unknown>;
          if (names.some(name=>!(name in row))) throw new Error('Incomplete row in '+table);
          statements.push(env.DB.prepare('INSERT INTO '+table+' ('+names.join(',')+') VALUES ('+names.map(()=>'?').join(',')+')')
            .bind(...names.map(name=>row[name]===undefined?null:row[name])));
        }
      }
      const results=await env.DB.batch(statements);
      if (results.some(result=>!result.success)) throw new Error('One or more D1 restore statements failed');
    };
    if (url.pathname==='/api/worker/system/restore' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      try {
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||typeof (body as Record<string,unknown>).filename!=='string') return json({error:'Backup filename is required'},400);
        const filename=String((body as Record<string,unknown>).filename);
        const row=await env.DB.prepare('SELECT * FROM backup_metadata WHERE filename=? LIMIT 1').bind(filename).first<Record<string,unknown>>();
        if (!row) return json({error:'BACKUP_NOT_FOUND'},404);
        const plain=await readBackup(row);
        const snapshot=JSON.parse(new TextDecoder().decode(plain));
        await makeBackup(check.ownerId);
        await restoreSnapshot(snapshot);
        return json({success:true});
      } catch(e) { console.error('Worker backup restore failed',e); return json({error:'Backup restore failed; a pre-restore backup was attempted'},503); }
    }
    if (url.pathname==='/api/worker/system/restore-upload' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      try {
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||typeof (body as Record<string,unknown>).content!=='string') return json({error:'Backup JSON content is required'},400);
        const content=String((body as Record<string,unknown>).content);
        if (content.length>30_000_000) return json({error:'Backup file is too large'},413);
        const snapshot=JSON.parse(content);
        await makeBackup(check.ownerId);
        await restoreSnapshot(snapshot);
        return json({success:true});
      } catch(e) { console.error('Worker uploaded backup restore failed',e); return json({error:'Uploaded backup could not be restored; a pre-restore backup was attempted'},400); }
    }

    if (url.pathname==='/api/worker/system/backup' && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      try { const backup=await makeBackup(check.ownerId); return json({success:true,filename:backup.filename}); }
      catch(e) { console.error('Worker backup creation failed',e); return json({error:'Backup creation failed'},503); }
    }
    if (url.pathname==='/api/worker/system/backups' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      const r=await env.DB.prepare('SELECT filename FROM backup_metadata ORDER BY created_at DESC').all<{filename:string}>();
      return r.success?json((r.results||[]).map(x=>x.filename)):json({error:'Backup list unavailable'},503);
    }
    const backupDownloadMatch=url.pathname.match(/^\/api\/worker\/system\/backups\/([A-Za-z0-9._-]{1,180})\/download$/);
    const currentBackupDownload=url.pathname==='/api/worker/system/backup/download' && request.method==='GET';
    if ((backupDownloadMatch||currentBackupDownload) && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      const check=await isPlatformOwner(request);
      if (!check.auth.ok) return json({error:check.auth.error},check.auth.status);
      if (!check.isOwner) return json({error:'FORBIDDEN'},403);
      try {
        const row=currentBackupDownload
          ? await env.DB.prepare('SELECT * FROM backup_metadata ORDER BY created_at DESC LIMIT 1').first<Record<string,unknown>>()
          : await env.DB.prepare('SELECT * FROM backup_metadata WHERE filename=? LIMIT 1').bind(decodeURIComponent(backupDownloadMatch![1])).first<Record<string,unknown>>();
        if (!row) return json({error:'BACKUP_NOT_FOUND'},404);
        const plain=await readBackup(row);
        const safeName=String(row.filename).replace(/[^A-Za-z0-9._-]/g,'_').replace(/\.enc$/,'');
        return new Response(plain,{status:200,headers:{'Content-Type':'application/json; charset=utf-8',
          'Content-Disposition':'attachment; filename="'+safeName+'"',
          'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      } catch(e) { console.error('Worker backup download failed',e); return json({error:'Backup download failed'},500); }
    }

    if (url.pathname==='/api/worker/system/audit-logs' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        if (String(auth.user.role)!=='PlatformOwner') return json({error:'FORBIDDEN'},403);
        const r=await env.DB.prepare('SELECT record_json FROM audit_logs ORDER BY timestamp DESC LIMIT 1000').all<{record_json:string}>();
        if (!r.success) return json({error:'Audit log unavailable'},503);
        return json((r.results||[]).flatMap(row=>{try{return [JSON.parse(row.record_json)]}catch{return[]}}));
      } catch(e) { console.error('Worker audit log read failed',e); return json({error:'Audit log unavailable'},500); }
    }

    if (url.pathname==='/api/worker/system/stats' && request.method==='GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const userId=String(auth.user.id);
        const [exams,archive,questions,curricula,subjects,recent]=await Promise.all([
          env.DB.prepare('SELECT record_json FROM exams WHERE owner_id=?').bind(userId).all<{record_json:string}>(),
          env.DB.prepare('SELECT record_json FROM archived_exams WHERE owner_id=?').bind(userId).all<{record_json:string}>(),
          env.DB.prepare('SELECT record_json FROM questions WHERE owner_id=?').bind(userId).all<{record_json:string}>(),
          env.DB.prepare('SELECT record_json FROM curricula').all<{record_json:string}>(),
          env.DB.prepare('SELECT COUNT(*) AS total FROM subjects WHERE is_active=1').first<{total:number}>(),
          env.DB.prepare('SELECT record_json FROM exams WHERE owner_id=? ORDER BY created_at DESC LIMIT 5').bind(userId).all<{record_json:string}>()
        ]);
        if (![exams,archive,questions,curricula].every(x=>x.success)) return json({error:'Dashboard statistics unavailable'},503);
        const parse=(rows:{record_json:string}[])=>rows.flatMap(row=>{try{return [JSON.parse(row.record_json) as Record<string,unknown>]}catch{return[]}});
        const examList=parse(exams.results||[]), archiveList=parse(archive.results||[]), questionList=parse(questions.results||[]), curriculumList=parse(curricula.results||[]);
        const grades=Array.from({length:9},(_,i)=>'Grade '+(i+1));
        const gradeStats=Object.fromEntries(grades.map(grade=>[grade,{
          examsCount:examList.filter(x=>x.grade===grade).length,
          questionsCount:questionList.filter(x=>x.grade===grade).length,
          unitsCount:curriculumList.filter(x=>x.grade===grade).length
        }]));
        return json({
          totalExams:examList.length,
          savedExams:examList.filter(x=>x.status==='Approved').length,
          draftExams:examList.filter(x=>['Draft','Validated'].includes(String(x.status))).length,
          archivedExams:archiveList.length,
          totalQuestions:questionList.length,
          activeSubjectsCount:Number(subjects?.total||0),
          gradeStats,
          recentExams:parse(recent.results||[]),
          hasAIAccess:auth.user.hasAIAccess===true
        });
      } catch(e) { console.error('Worker dashboard stats failed',e); return json({error:'Dashboard statistics unavailable'},500); }
    }


    if (url.pathname==='/api/worker/bootstrap/status' && request.method==='GET') {
      if (!env.DB) return json({error:'Database unavailable'},503);
      try {
        const row=await env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first<{total:number}>();
        return json({needsSetup:Number(row?.total||0)===0});
      } catch(e) { console.error('Bootstrap status check failed',e); return json({error:'Bootstrap status unavailable'},500); }
    }
    if (url.pathname==='/api/worker/bootstrap' && request.method==='POST') {
      if (serviceUnavailable(env)||!env.BOOTSTRAP_TOKEN||env.BOOTSTRAP_TOKEN.length<32) return json({error:'Bootstrap is not configured'},503);
      try {
        const body:unknown=await request.json().catch(()=>null);
        if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid bootstrap request'},400);
        const input=body as Record<string,unknown>;
        const supplied=typeof input.token==='string'?input.token:'';
        const expectedBytes=new TextEncoder().encode(env.BOOTSTRAP_TOKEN);
        const suppliedBytes=new TextEncoder().encode(supplied);
        const expectedHash=new Uint8Array(await crypto.subtle.digest('SHA-256',expectedBytes));
        const suppliedHash=new Uint8Array(await crypto.subtle.digest('SHA-256',suppliedBytes));
        let mismatch=expectedHash.length^suppliedHash.length;
        for(let i=0;i<expectedHash.length;i++) mismatch|=expectedHash[i]^(suppliedHash[i]||0);
        if (mismatch!==0) return json({error:'Invalid bootstrap token'},403);
        const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM app_users').first<{total:number}>();
        if (Number(count?.total||0)!==0) return json({error:'BOOTSTRAP_ALREADY_COMPLETED'},409);
        const fullName=typeof input.fullName==='string'?input.fullName.trim():'';
        const username=typeof input.username==='string'?input.username.trim():'';
        const password=typeof input.password==='string'?input.password:'';
        if (fullName.length<3||fullName.length>120||!/^[A-Za-z0-9._-]{3,32}$/.test(username)||password.length<12||password.length>128) {
          return json({error:'Name, username, or password does not meet the requirements'},400);
        }
        const now=new Date().toISOString(),id='usr-'+crypto.randomUUID();
        const user={id,username,name:fullName,role:'PlatformOwner',status:'ACTIVE',hasAIAccess:false,
          assignedSubjects:['all'],assignedGrades:['all'],
          delegatedPermissions:{canManageTeachers:true,canManageSubjects:true,canManageIdentity:true,canManageCurricula:true},
          createdAt:now,passwordHash:await bcrypt.hash(password,12),authVersion:0};
        const created=await env.DB.prepare('INSERT INTO app_users (id,username,role,status,record_json,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM app_users)=0')
          .bind(id,username,'PlatformOwner','ACTIVE',JSON.stringify(user),now,now).run();
        if (!created.success||Number(created.meta?.changes||0)!==1) return json({error:'BOOTSTRAP_RACE_OR_FAILURE'},409);
        const {passwordHash:_hash,authVersion:_version,...safe}=user;
        return json({success:true,user:safe},201);
      } catch(e) { console.error('Platform owner bootstrap failed',e); return json({error:'Bootstrap failed'},500); }
    }

    if (url.pathname === '/api/worker/health' && request.method === 'GET') {
      return json({ status: 'ok', runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
    }




    // Archive workspace: restore is owner-only and inserts before removing the archived copy.
    if (url.pathname === '/api/worker/archive' && request.method === 'GET') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const r=await env.DB.prepare('SELECT record_json FROM archived_exams WHERE owner_id = ? ORDER BY archived_at DESC')
          .bind(auth.user.id).all<{record_json:string}>();
        if (!r.success) return json({error:'Archive unavailable'},503);
        const items=(r.results||[]).flatMap(row=>{try{const v=JSON.parse(row.record_json);return v&&typeof v==='object'?[v]:[]}catch{return[]}});
        return json(items);
      } catch(e) { console.error('Worker archive read failed',e); return json({error:'Archive unavailable'},500); }
    }
    const restorePrefix='/api/worker/archive/';
    const restoreTail=url.pathname.startsWith(restorePrefix)?url.pathname.slice(restorePrefix.length):'';
    const restoreId=restoreTail.endsWith('/restore')?restoreTail.slice(0,-8):'';
    if (restoreId && /^[A-Za-z0-9_-]{1,128}$/.test(restoreId) && request.method==='POST') {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const row=await env.DB.prepare('SELECT record_json FROM archived_exams WHERE id=? AND owner_id=? LIMIT 1')
          .bind(restoreId,auth.user.id).first<{record_json:string}>();
        if (!row) return json({error:'ARCHIVED_EXAM_NOT_FOUND'},404);
        const exam=JSON.parse(row.record_json) as Record<string,unknown>;
        const restored: Record<string,unknown>={...exam,status:'Draft',archivedAt:null,updatedAt:new Date().toISOString()};
        const ins=await env.DB.prepare('INSERT INTO exams (id,owner_id,subject_id,grade,status,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,subject_id=excluded.subject_id,grade=excluded.grade,status=excluded.status,record_json=excluded.record_json,updated_at=excluded.updated_at')
          .bind(restoreId,auth.user.id,String(restored.subjectId||'subj-en'),String(restored.grade||''),'Draft',JSON.stringify(restored),String(restored.createdAt||new Date().toISOString()),String(restored.updatedAt)).run();
        if (!ins.success) return json({error:'EXAM_RESTORE_FAILED'},503);
        const del=await env.DB.prepare('DELETE FROM archived_exams WHERE id=? AND owner_id=?').bind(restoreId,auth.user.id).run();
        return del.success?json({success:true}):json({error:'EXAM_RESTORE_PENDING_CLEANUP'},503);
      } catch(e) { console.error('Worker exam restore failed',e); return json({error:'EXAM_RESTORE_FAILED'},500); }
    }

    // Exam sharing is opt-in and only the owner may grant or revoke access.
    const sharePrefix='/api/worker/exams/';
    const shareTail=url.pathname.startsWith(sharePrefix)?url.pathname.slice(sharePrefix.length):'';
    const shareParts=shareTail.split('/');
    const shareExamId=/^[A-Za-z0-9_-]{1,128}$/.test(shareParts[0]||'')?shareParts[0]:'';
    if (shareExamId && shareParts[1]==='share' && (shareParts.length===2 || shareParts.length===3) &&
        ((shareParts.length===2 && request.method==='POST') || (shareParts.length===3 && request.method==='DELETE'))) {
      if (serviceUnavailable(env)) return json({error:'Service unavailable'},503);
      try {
        const auth=await authenticateWorkerRequest(request,env.SESSION_SECRET,new D1AuthVersionReader(env.DB),new D1UserRepository(env.DB));
        if (!auth.ok) return json({error:auth.error},auth.status);
        const actor=auth.user as Record<string,unknown>;
        const row=await env.DB.prepare('SELECT record_json FROM exams WHERE id=? AND owner_id=? LIMIT 1')
          .bind(shareExamId,actor.id).first<{record_json:string}>();
        if (!row) return json({error:'EXAM_NOT_FOUND_OR_NOT_OWNER'},404);
        const exam=JSON.parse(row.record_json) as Record<string,unknown>;
        let shares=Array.isArray(exam.sharedWith)?[...exam.sharedWith] as Array<Record<string,unknown>>:[];
        if (request.method==='POST') {
          const body:unknown=await request.json().catch(()=>null);
          if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid share request'},400);
          const input=body as Record<string,unknown>;
          const targetId=typeof input.targetUserId==='string'?input.targetUserId:'';
          const permission=input.permission==='edit'?'edit':input.permission==='view'?'view':'';
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)||!permission||targetId===actor.id) return json({error:'Invalid share target or permission'},400);
          const target=await new D1UserRepository(env.DB).findPublicById(targetId);
          if (!target||target.status!=='ACTIVE') return json({error:'SHARE_TARGET_UNAVAILABLE'},404);
          const grades=Array.isArray(target.assignedGrades)?target.assignedGrades.map(String):[];
          const subjects=Array.isArray(target.assignedSubjects)?target.assignedSubjects.map(String):[];
          const isAdmin=['PlatformOwner','Administrator','SchoolAdmin'].includes(String(target.role));
          if (!isAdmin && (!(grades.includes('all')||grades.includes(String(exam.grade||''))) ||
              !(subjects.includes('all')||subjects.includes(String(exam.subjectId||'subj-en'))))) return json({error:'SHARE_TARGET_OUT_OF_SCOPE'},403);
          shares=shares.filter(x=>x.userId!==targetId);
          shares.push({userId:targetId,permission,sharedAt:new Date().toISOString(),sharedBy:actor.id});
        } else {
          const targetId=shareParts[2];
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) return json({error:'Invalid share target'},400);
          shares=shares.filter(x=>x.userId!==targetId);
        }
        const updated={...exam,sharedWith:shares,sharingEnabled:shares.length>0,updatedAt:new Date().toISOString()};
        const saved=await env.DB.prepare('UPDATE exams SET record_json=?,updated_at=? WHERE id=? AND owner_id=?')
          .bind(JSON.stringify(updated),String(updated.updatedAt),shareExamId,actor.id).run();
        if (!saved.success||Number(saved.meta?.changes||0)!==1) return json({error:'EXAM_SHARE_UPDATE_FAILED'},503);
        return json({success:true,exam:updated});
      } catch(e) { console.error('Worker exam sharing failed',e); return json({error:'EXAM_SHARE_FAILED'},500); }
    }

    const examPrefix = '/api/worker/exams/';
    const examTail = url.pathname.startsWith(examPrefix) ? url.pathname.slice(examPrefix.length) : '';
    const examParts = examTail.split('/');
    const examId = /^[A-Za-z0-9_-]{1,128}$/.test(examParts[0] || '') ? examParts[0] : '';
    const examAction = examParts.length === 2 ? examParts[1] : '';
    const examCollection = url.pathname === '/api/worker/exams';
    if ((examCollection && ['GET','POST'].includes(request.method)) ||
        (examId && ((examParts.length === 1 && ['GET','PUT','DELETE'].includes(request.method)) ||
        (examParts.length === 2 && request.method === 'POST' && ['clone','approve'].includes(examAction))))) {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user as Record<string, unknown>;
        const role = String(actor.role || '');
        const grades = Array.isArray(actor.assignedGrades) ? actor.assignedGrades.map(String) : [];
        const subjects = Array.isArray(actor.assignedSubjects) ? actor.assignedSubjects.map(String) : [];
        const admin = ['PlatformOwner','Administrator','SchoolAdmin'].includes(role);
        const inScope = (e: Record<string, unknown>) => admin ||
          ((grades.includes('all') || grades.includes(String(e.grade || ''))) &&
           (subjects.includes('all') || subjects.includes(String(e.subjectId || 'subj-en'))));
        const allowed = (e: Record<string, unknown>, need: 'view'|'edit') => {
          if (e.ownerId === actor.id || e.createdBy === actor.id) return true;
          const shares = Array.isArray(e.sharedWith) ? e.sharedWith : [];
          return shares.some(x => !!x && typeof x === 'object' &&
            (x as Record<string,unknown>).userId === actor.id &&
            ((x as Record<string,unknown>).permission === 'edit' ||
             (need === 'view' && (x as Record<string,unknown>).permission === 'view')));
        };
        const parse = (s: string): Record<string,unknown>|null => {
          try { const v: unknown = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : null; }
          catch { return null; }
        };
        const read = async (id: string) => {
          const r = await env.DB.prepare('SELECT record_json FROM exams WHERE id = ? LIMIT 1').bind(id).first<{record_json:string}>();
          return r ? parse(r.record_json) : null;
        };
        const save = async (e: Record<string,unknown>) => {
          const createdAt = typeof e.createdAt === 'string' ? e.createdAt : new Date().toISOString();
          const updatedAt = new Date().toISOString();
          const v: Record<string, unknown> = { ...e, createdAt, updatedAt };
          const r = await env.DB.prepare(
            'INSERT INTO exams (id, owner_id, subject_id, grade, status, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, subject_id=excluded.subject_id, grade=excluded.grade, status=excluded.status, record_json=excluded.record_json, updated_at=excluded.updated_at'
          ).bind(String(v.id), String(v.ownerId || v.createdBy || actor.id), String(v.subjectId || 'subj-en'),
            String(v.grade || ''), String(v.status || 'Draft'), JSON.stringify(v), createdAt, updatedAt).run();
          if (!r.success) throw new Error('D1 exam save failed');
          return v;
        };
        if (examCollection && request.method === 'GET') {
          const r = await env.DB.prepare('SELECT record_json FROM exams ORDER BY created_at DESC').all<{record_json:string}>();
          if (!r.success) return json({error:'Exam workspace unavailable'},503);
          return json((r.results||[]).flatMap(row => { const e=parse(row.record_json); return e && inScope(e) && allowed(e,'view') ? [e] : []; }));
        }
        if (examCollection && request.method === 'POST') {
          if (Number(request.headers.get('Content-Length')||0)>10_000_000) return json({error:'Exam payload is too large'},413);
          const body: unknown = await request.json().catch(()=>null);
          if (!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Invalid exam payload'},400);
          const input=body as Record<string,unknown>;
          if (!hasValidExamImagePayload(input)) return json({error:'Invalid or oversized exam image payload'},400);
          if (typeof input.title!=='string'||!input.title.trim()||typeof input.grade!=='string'||!input.grade.trim()||!Array.isArray(input.sections)) return json({error:'Incomplete exam data'},400);
          if (!inScope(input)) return json({error:'FORBIDDEN_ACADEMIC_SCOPE'},403);
          if (typeof input.id==='string' && input.id.trim()) {
            const old=await read(input.id);
            if (old) {
              if (!allowed(old,'edit')) return json({error:'FORBIDDEN_EXAM_EDIT'},403);
              const {ownerId:_o,createdBy:_c,createdByName:_n,sharedWith:_s,id:_i,...patch}=input;
              return json({success:true,exam:await save({...old,...patch,id:input.id,ownerId:old.ownerId||old.createdBy||actor.id})});
            }
          }
          const now=new Date().toISOString();
          return json({success:true,exam:await save({...input,id:typeof input.id==='string'?input.id:'exam-'+crypto.randomUUID(),
            ownerId:actor.id,createdBy:actor.id,createdByName:actor.name,sharingEnabled:false,sharedWith:[],createdAt:now})});
        }
        const existing=await read(examId);
        if (!existing) return json({error:'EXAM_NOT_FOUND'},404);
        if (!inScope(existing)) return json({error:'FORBIDDEN_ACADEMIC_SCOPE'},403);
        if (request.method==='GET') return allowed(existing,'view')?json(existing):json({error:'FORBIDDEN_EXAM_VIEW'},403);
        if (request.method==='DELETE') {
          if ((existing.ownerId||existing.createdBy)!==actor.id) return json({error:'FORBIDDEN_EXAM_ARCHIVE'},403);
          const at=new Date().toISOString(), archived={...existing,status:'Archived',archivedAt:at,updatedAt:at};
          const ins=await env.DB.prepare('INSERT INTO archived_exams (id, owner_id, subject_id, grade, status, record_json, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,status=excluded.status,archived_at=excluded.archived_at')
            .bind(examId,String(existing.ownerId||existing.createdBy||actor.id),String(existing.subjectId||'subj-en'),String(existing.grade||''),'Archived',JSON.stringify(archived),at).run();
          if (!ins.success) return json({error:'EXAM_ARCHIVE_FAILED'},503);
          const del=await env.DB.prepare('DELETE FROM exams WHERE id=? AND owner_id=?').bind(examId,String(existing.ownerId||existing.createdBy||actor.id)).run();
          return del.success?json({success:true}):json({error:'EXAM_ARCHIVE_FAILED'},503);
        }
        if (request.method==='PUT') {
          if (!allowed(existing,'edit')) return json({error:'FORBIDDEN_EXAM_EDIT'},403);
          if (Number(request.headers.get('Content-Length')||0)>10_000_000) return json({error:'Exam payload is too large'},413);
          const body: unknown=await request.json().catch(()=>null);
          if (!body||typeof body!=='object'||Array.isArray(body)) return json({error:'Invalid exam update'},400);
          const patch=body as Record<string,unknown>;
          if (!hasValidExamImagePayload(patch)) return json({error:'Invalid or oversized exam image payload'},400);
          const {ownerId:_o,createdBy:_c,createdByName:_n,sharedWith:_s,id:_i,...safe}=patch;
          const next={...existing,...safe,id:examId,ownerId:existing.ownerId||existing.createdBy||actor.id,createdBy:existing.createdBy||actor.id};
          if (!inScope(next)) return json({error:'FORBIDDEN_ACADEMIC_SCOPE'},403);
          return json({success:true,exam:await save(next)});
        }
        if (examAction==='approve' && request.method==='POST') {
          if (!allowed(existing,'edit')) return json({error:'FORBIDDEN_EXAM_EDIT'},403);
          return json({success:true,exam:await save({...existing,status:'Approved'})});
        }
        if (examAction==='clone' && request.method==='POST') {
          if (!allowed(existing,'view')) return json({error:'FORBIDDEN_EXAM_VIEW'},403);
          const now=new Date().toISOString();
          const clone=await save({...existing,id:'exam-'+crypto.randomUUID(),code:String(existing.code||'EXAM')+'-COPY',
            title:String(existing.title||'Exam')+' (Copy)',titleAr:String(existing.titleAr||existing.title||'اختبار')+' (نسخة جديدة)',
            status:'Draft',ownerId:actor.id,createdBy:actor.id,createdByName:actor.name,sharingEnabled:false,sharedWith:[],createdAt:now});
          return json({success:true,exam:clone});
        }
      } catch (error) {
        console.error('Worker exam request failed',error);
        return json({error:'Exam operation failed'},500);
      }
    }

    const pdfRoute = url.pathname.match(/^\/api\/worker\/exams\/([A-Za-z0-9_-]{1,128})\/export-pdf$/);
    if (pdfRoute && request.method === 'POST') {
      if (serviceUnavailable(env) || !env.BROWSER) return json({ error: 'PDF rendering unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > 10_000_000) return json({ error: 'PDF source is too large' }, 413);
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid PDF request' }, 400);
        const input = body as Record<string, unknown>;
        if (typeof input.htmlDocument !== 'string' || input.htmlDocument.length < 100 || input.htmlDocument.length > 9_500_000) {
          return json({ error: 'Invalid PDF document' }, 400);
        }
        const mode = input.mode === 'TeacherAnswerKey' ? 'TeacherAnswerKey' : 'StudentPaper';
        const html = input.htmlDocument
          .replace(/<\/?(?:script|iframe|object|embed|base|form)\b[^>]*>/gi, '')
          .replace(/<link\b[^>]*>/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/@import\s+[^;]+;?/gi, '')
          .replace(/url\(\s*(['"]?)(?:https?:|javascript:|file:|data:text\/html)[^)]*\)/gi, 'none')
          .replace(/\s+(?:src|href)\s*=\s*(['"])https?:[^'"]*\1/gi, '');
        const rate = await env.DB.prepare(
          "INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts, locked_until) VALUES (?, ?, 1, NULL) " +
          "ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN window_started_at + 60000 <= ? THEN 1 ELSE attempts + 1 END, " +
          "window_started_at = CASE WHEN window_started_at + 60000 <= ? THEN ? ELSE window_started_at END RETURNING attempts"
        ).bind(`pdf:${auth.user.id}`, Date.now(), Date.now(), Date.now(), Date.now()).first<{ attempts: number }>();
        if (!rate || Number(rate.attempts) > 8) return json({ error: 'PDF export rate limit exceeded' }, 429);

        const pdf = await env.BROWSER.quickAction('pdf', {
          html,
          pdfOptions: { printBackground: true, preferCSSPageSize: true },
          rejectRequestPattern: ['.*'],
        });
        if (!pdf.ok) return json({ error: 'PDF rendering failed' }, 502);
        const filename = typeof input.filename === 'string' && /^[A-Za-z0-9._-]{1,100}\.pdf$/i.test(input.filename)
          ? input.filename
          : `exam-${mode === 'TeacherAnswerKey' ? 'answer-key' : 'student'}.pdf`;
        return new Response(pdf.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (error) {
        console.error('Worker PDF export failed', error);
        return json({ error: 'PDF export failed' }, 500);
      }
    }

    if (url.pathname.startsWith('/api/worker/question-images')) {
      if (serviceUnavailable(env) || !env.QUESTION_IMAGES) {
        return json({ error: 'Image storage unavailable' }, 503);
      }
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const storage = new QuestionImageStorage(env.QUESTION_IMAGES, env.DB);
        const ownerId = typeof auth.user.id === 'string' ? auth.user.id : '';
        if (!ownerId) return json({ error: 'Invalid authenticated user' }, 401);

        if (url.pathname === '/api/worker/question-images' && request.method === 'POST') {
          const length = Number(request.headers.get('Content-Length') || 0);
          if (length > 4_100_000) return json({ error: 'Image payload is too large' }, 413);
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return json({ error: 'Invalid image payload' }, 400);
          }
          const input = body as Record<string, unknown>;
          const questionId = typeof input.questionId === 'string' ? input.questionId : '';
          const dataUrl = typeof input.imageDataUrl === 'string' ? input.imageDataUrl : '';
          const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
          if (!match || match[2].length > 3_916_020) return json({ error: 'Unsupported or oversized image' }, 400);
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const metadata = await storage.upload({
            ownerId,
            questionId,
            contentType: match[1],
            bytes,
          });
          return json({ success: true, image: { id: metadata.id, questionId: metadata.questionId, contentType: metadata.contentType, byteSize: metadata.byteSize } }, 201);
        }

        const imageMatch = url.pathname.match(/^\/api\/worker\/question-images\/([A-Za-z0-9_-]{1,128})$/);
        if (imageMatch && request.method === 'GET') {
          const image = await storage.getForOwner(imageMatch[1], ownerId);
          if (!image) return json({ error: 'Image not found' }, 404);
          return new Response(image.bytes, {
            headers: {
              'Content-Type': image.contentType,
              'Content-Length': String(image.byteSize),
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        if (imageMatch && request.method === 'DELETE') {
          const deleted = await storage.deleteForOwner(imageMatch[1], ownerId);
          return deleted ? json({ success: true }) : json({ error: 'Image not found' }, 404);
        }
        return json({ error: 'Not found' }, 404);
      } catch (error) {
        console.error('Worker question image request failed', error);
        return json({ error: 'Image request failed' }, 400);
      }
    }

    if (url.pathname.startsWith('/api/worker/auth/') || url.pathname.startsWith('/api/worker/owner/')) {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const authService = new WorkerAuthService(env.DB, env.SESSION_SECRET);

        if (url.pathname === '/api/worker/auth/register' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => null);
          const result = await authService.register(
            body,
            clientIp(request),
            request.headers.get('User-Agent') || '',
          );
          return json(result.body, result.status);
        }

        if (url.pathname === '/api/worker/auth/login' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => null);
          const result = await authService.login(body, clientIp(request));
          return json(result.body, result.status);
        }

        if (url.pathname === '/api/worker/auth/me' && request.method === 'GET') {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          return json({ user: auth.user });
        }

        if (url.pathname.startsWith('/api/worker/owner/registration-requests')) {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          if (!['PlatformOwner', 'Administrator'].includes(String(auth.user.role))) {
            return json({ error: 'FORBIDDEN' }, 403);
          }

          if (url.pathname === '/api/worker/owner/registration-requests' && request.method === 'GET') {
            const status = url.searchParams.get('status') || undefined;
            return json({ requests: await authService.listRegistrationRequests(status) });
          }

          const match = url.pathname.match(/^\/api\/worker\/owner\/registration-requests\/([^/]+)\/(approve|reject|needs-edit)$/);
          if (match && request.method === 'POST') {
            const requestId = decodeURIComponent(match[1]);
            const body: unknown = await request.json().catch(() => ({}));
            const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
            if (match[2] === 'approve') {
              const outcome = await authService.approveRegistrationRequest(requestId, auth.user, {
                role: typeof input.role === 'string' ? input.role : undefined,
                assignedSubjects: input.assignedSubjects,
                assignedGrades: input.assignedGrades,
                reviewNote: typeof input.reviewNote === 'string' ? input.reviewNote : undefined,
              });
              return outcome
                ? json({ success: true, ...outcome })
                : json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
            }

            const reviewNote = typeof input.reviewNote === 'string'
              ? input.reviewNote
              : typeof input.reason === 'string' ? input.reason : 'لم تستوفِ البيانات الشروط المطلوبة';
            const status = match[2] === 'reject' ? 'REJECTED' : 'NEEDS_EDIT';
            const updated = await authService.reviewRegistrationRequest(requestId, auth.user, status, reviewNote);
            return updated
              ? json({ success: true, request: updated })
              : json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
          }
        }
      } catch (error) {
        console.error('Worker authentication request failed', error);
        return json({ error: 'Internal server error' }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
