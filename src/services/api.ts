import {
  User,
  Subject,
  SchoolIdentitySettings,
  CurriculumUnit,
  Question,
  Exam,
  AISettingsState,
  AIUsageLog,
  QualityValidationReport,
  GradeLevel,
  QuestionType,
  DifficultyLevel,
  ExtractedAnalysisResult,
  AnalyzedDocument,
  ContentScope,
  QuestionSourceCode,
  EducationalLevel,
  SemanticFidelityReport,
  RegistrationRequest,
  NotificationItem,
  AuditLogEntry,
  LayoutTemplate,
  ExamLayoutConfig,
} from '../types/index.ts';

class ApiService {
  private authToken: string = '';
  private unauthorizedHandler?: () => void;

  public setAuthToken(token: string) {
    this.authToken = token;
  }

  public getAuthToken(): string {
    return this.authToken;
  }

  public setUnauthorizedHandler(handler?: () => void) {
    this.unauthorizedHandler = handler;
  }

  private triggerUnauthorized(status: number, url: string) {
    if (status === 401 && url !== '/api/worker/auth/login') {
      this.unauthorizedHandler?.();
    }
  }

  private async request<T>(
    url: string,
    options: RequestInit & { allowEmptyResponse?: boolean } = {}
  ): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const maxAttempts = method === 'GET' ? 3 : 1;
    let lastError: Error | null = null;
    const { allowEmptyResponse, ...fetchOptions } = options;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (fetchOptions.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const token =
        this.authToken ||
        (typeof localStorage !== 'undefined' ? localStorage.getItem('abuhussam_auth_token') || '' : '');
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...((fetchOptions.headers as Record<string, string>) || {}),
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const res = await fetch(url, { ...fetchOptions, headers });
        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        const rawText = await res.text();
        const trimmed = rawText.trimStart();
        const looksLikeHtml =
          trimmed.startsWith('<') || (contentType.includes('text/html') && !contentType.includes('application/json'));
        const isEmptyBody = !rawText.trim();

        // Retry transient HTML fallback / gateway hiccups / empty truncated body strictly on idempotent GET requests
        if (
          attempt < maxAttempts - 1 &&
          method === 'GET' &&
          (looksLikeHtml ||
            res.status === 502 ||
            res.status === 503 ||
            res.status === 504 ||
            (res.ok && res.status !== 204 && !allowEmptyResponse && isEmptyBody))
        ) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }

        let data: any = null;
        if (!isEmptyBody) {
          if (looksLikeHtml) {
            throw new Error('استجاب الخادم بصفحة HTML غير متوقعة أثناء التحديث — يرجى إعادة المحاولة.');
          }
          try {
            data = JSON.parse(rawText);
          } catch {
            throw new Error(
              res.ok
                ? 'تعذر قراءة استجابة الخادم بصيغة JSON صالحة.'
                : `تعذر إتمام الطلب (رمز الحالة ${res.status})`
            );
          }
        }

        this.triggerUnauthorized(res.status, url);

        if (!res.ok) {
          throw new Error(data?.error || `حدث خطأ في معالجة الطلب (${res.status})`);
        }

        if (isEmptyBody) {
          if (res.status === 204 || allowEmptyResponse) {
            return undefined as unknown as T;
          }
          throw new Error('استجابة غير مكتملة من الخادم (بيانات فارغة).');
        }

        return data as T;
      } catch (err: any) {
        if (err?.name === 'AbortError' || fetchOptions.signal?.aborted) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err || 'تعذر الاتصال بالخادم'));
        const isTransientNetwork =
          method === 'GET' &&
          attempt < maxAttempts - 1 &&
          (err?.name === 'TypeError' || /network|fetch/i.test(lastError.message));
        if (isTransientNetwork) {
          await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('تعذر الاتصال بالخادم');
  }

  // Auth & School Public Identity
  async getSchoolIdentity(): Promise<SchoolIdentitySettings> {
    return this.request('/api/worker/school/identity');
  }

  async updateSchoolIdentity(patch: Partial<SchoolIdentitySettings>): Promise<{ success: boolean; settings: SchoolIdentitySettings }> {
    return this.request('/api/worker/school/identity', {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }


  async uploadQuestionImage(questionId: string, imageDataUrl: string): Promise<{
    success: boolean;
    image: { id: string; questionId: string; contentType: string; byteSize: number };
  }> {
    return this.request('/api/worker/question-images', {
      method: 'POST',
      body: JSON.stringify({ questionId, imageDataUrl }),
    });
  }

  async getQuestionImageBlob(imageId: string): Promise<Blob> {
    const token =
      this.authToken ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('abuhussam_auth_token') || '' : '');
    const response = await fetch(`/api/worker/question-images/${encodeURIComponent(imageId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('تعذر تحميل صورة السؤال من التخزين الآمن');
    return response.blob();
  }

  async deleteQuestionImage(imageId: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/question-images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    });
  }

  async login(username: string, password: string): Promise<{ success: boolean; token: string; user: User }> {
    return this.request('/api/worker/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request('/api/worker/auth/me');
  }

  async switchUser(userId: string): Promise<{ success: boolean; token: string; user: User }> {
    return this.request('/api/worker/auth/switch-user', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  async resetPassword(userId: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request('/api/worker/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, newPassword }),
    });
  }

  async registerAccount(payload: {
    fullName: string;
    username: string;
    password: string;
    confirmPassword: string;
    requestedRole: 'Teacher' | 'SchoolAdmin';
    assignedSubjects: string[];
    assignedGrades: string[];
    phone?: string;
    notes?: string;
  }): Promise<{ success: boolean; status: string; request: RegistrationRequest; message: string }> {
    return this.request('/api/worker/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getPublicSubjects(): Promise<Subject[]> {
    return this.request('/api/worker/catalog/subjects?active=true');
  }

  // Notifications (Role-scoped)
  async getNotifications(): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
    return this.request('/api/worker/notifications');
  }

  async markNotificationRead(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead(): Promise<{ success: boolean; updatedCount: number }> {
    return this.request('/api/worker/notifications/read-all', {
      method: 'POST',
    });
  }

  // Subjects
  async getSubjects(activeOnly = false): Promise<Subject[]> {
    const q = activeOnly ? '?active=true' : '';
    return this.request(`/api/worker/catalog/subjects${q}`);
  }

  async createSubject(subject: Partial<Subject>): Promise<{ success: boolean; subject: Subject }> {
    return this.request('/api/worker/catalog/subjects', {
      method: 'POST',
      body: JSON.stringify(subject),
    });
  }

  async updateSubject(id: string, subject: Partial<Subject>): Promise<{ success: boolean; subject: Subject }> {
    return this.request(`/api/worker/catalog/subjects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(subject),
    });
  }

  async deleteSubject(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/subjects/${id}`, {
      method: 'DELETE',
    });
  }

  // Dashboard Stats
  async getDashboardStats(signal?: AbortSignal): Promise<any> {
    return this.request('/api/worker/system/stats', { signal });
  }

  // Curricula
  async getCurricula(grade?: string, subjectId?: string): Promise<CurriculumUnit[]> {
    const params = new URLSearchParams();
    if (grade) params.set('grade', grade);
    if (subjectId) params.set('subjectId', subjectId);
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/worker/curricula${q}`);
  }

  async addUnit(unit: Partial<CurriculumUnit>): Promise<{ success: boolean; unit: CurriculumUnit }> {
    return this.request('/api/worker/curricula/unit', {
      method: 'POST',
      body: JSON.stringify(unit),
    });
  }

  async updateUnit(id: string, unit: Partial<CurriculumUnit>): Promise<{ success: boolean; unit: CurriculumUnit }> {
    return this.request(`/api/worker/curricula/unit/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(unit),
    });
  }

  async deleteUnit(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/curricula/unit/${id}`, {
      method: 'DELETE',
    });
  }

  async resetCurricula(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/worker/curricula/reset', {
      method: 'POST',
    });
  }

  // Questions
  async getQuestions(filters?: {
    grade?: string;
    subjectId?: string;
    unitId?: string;
    type?: string;
    difficulty?: string;
    search?: string;
    sourceCode?: QuestionSourceCode;
    educationalLevel?: EducationalLevel;
    grammarCategory?: string;
  }): Promise<Question[]> {
    const params = new URLSearchParams();
    if (filters?.grade) params.set('grade', filters.grade);
    if (filters?.subjectId) params.set('subjectId', filters.subjectId);
    if (filters?.unitId) params.set('unitId', filters.unitId);
    if (filters?.type) params.set('type', filters.type);
    if (filters?.difficulty) params.set('difficulty', filters.difficulty);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.sourceCode) params.set('sourceCode', filters.sourceCode);
    if (filters?.educationalLevel) params.set('educationalLevel', filters.educationalLevel);
    if (filters?.grammarCategory) params.set('grammarCategory', filters.grammarCategory);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/worker/questions${query}`);
  }

  async addQuestion(question: Partial<Question>): Promise<{ success: boolean; question: Question }> {
    return this.request('/api/worker/questions', {
      method: 'POST',
      body: JSON.stringify(question),
    });
  }

  async updateQuestion(id: string, question: Partial<Question>): Promise<{ success: boolean; question: Question }> {
    return this.request(`/api/worker/questions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(question),
    });
  }

  async deleteQuestion(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/questions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async generateQuestionWithAI(params: {
    grade: GradeLevel;
    unitTitle: string;
    type: QuestionType;
    difficulty: DifficultyLevel;
    marks: number;
    lessonFocus?: string;
    sourceCode?: QuestionSourceCode;
    educationalLevel?: EducationalLevel;
    grammarCategory?: string;
  }): Promise<{ success: boolean; question: Question; modelUsed: string }> {
    return this.request('/api/worker/questions/generate', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Exams
  async getExams(): Promise<Exam[]> {
    return this.request('/api/worker/exams');
  }

  async getExamById(id: string): Promise<Exam> {
    return this.request(`/api/worker/exams/${encodeURIComponent(id)}`);
  }

  async saveExam(exam: Partial<Exam>): Promise<{ success: boolean; exam: Exam }> {
    return this.request('/api/worker/exams', {
      method: 'POST',
      body: JSON.stringify(exam),
    });
  }

  async updateExam(id: string, exam: Partial<Exam>): Promise<{ success: boolean; exam: Exam }> {
    return this.request(`/api/worker/exams/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(exam),
    });
  }

  async deleteExam(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/exams/${id}`, {
      method: 'DELETE',
    });
  }

  async cloneExam(id: string): Promise<{ success: boolean; exam: Exam }> {
    return this.request(`/api/worker/exams/${encodeURIComponent(id)}/clone`, {
      method: 'POST',
    });
  }

  async approveExam(id: string): Promise<{ success: boolean; exam: Exam }> {
    return this.request(`/api/worker/exams/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
    });
  }

  async shareExam(examId: string, targetUserId: string, permission: 'view' | 'edit'): Promise<{ success: boolean; exam: Exam }> {
    return this.request(`/api/worker/exams/${encodeURIComponent(examId)}/share`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId, permission }),
    });
  }

  async revokeExamShare(examId: string, targetUserId: string): Promise<{ success: boolean; exam: Exam }> {
    return this.request(`/api/worker/exams/${encodeURIComponent(examId)}/share/${encodeURIComponent(targetUserId)}`, {
      method: 'DELETE',
    });
  }

  async logExamExport(examId: string, mode: 'StudentPaper' | 'TeacherAnswerKey'): Promise<{ success: boolean }> {
    return this.request(`/api/exams/${examId}/export-log`, {
      method: 'POST',
      body: JSON.stringify({ mode }),
    });
  }

  async exportExamPdf(
    examId: string,
    payload: {
      htmlDocument: string;
      mode: 'StudentPaper' | 'TeacherAnswerKey';
      orientation?: 'portrait' | 'landscape';
      filename?: string;
    }
  ): Promise<{ downloaded: boolean; fallbackClientPrint?: boolean }> {
    const token =
      this.authToken ||
      (typeof localStorage !== 'undefined' ? localStorage.getItem('abuhussam_auth_token') || '' : '');
    const endpoint = `/api/worker/exams/${encodeURIComponent(examId)}/export-pdf`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      this.triggerUnauthorized(401, endpoint);
      throw new Error('جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً');
    }

    if (res.status === 501) {
      return { downloaded: false, fallbackClientPrint: true };
    }

    if (!res.ok) {
      let msg = 'تعذر تصدير ملف PDF';
      try {
        const rawErr = await res.text();
        if (rawErr && !rawErr.trimStart().startsWith('<')) {
          const errJson = JSON.parse(rawErr);
          if (errJson?.fallbackClientPrint) {
            return { downloaded: false, fallbackClientPrint: true };
          }
          if (errJson?.error) msg = errJson.error;
        }
      } catch {
        // ignore parse error
      }
      throw new Error(msg);
    }

    const resType = (res.headers.get('content-type') || '').toLowerCase();
    if (resType.includes('text/html')) {
      return { downloaded: false, fallbackClientPrint: true };
    }

    if (!resType.includes('application/pdf')) {
      if (resType.includes('application/json')) {
        try {
          const jsonText = await res.text();
          const parsed = JSON.parse(jsonText);
          if (parsed?.fallbackClientPrint) {
            return { downloaded: false, fallbackClientPrint: true };
          }
          if (parsed?.error) {
            throw new Error(parsed.error);
          }
        } catch (err: any) {
          if (err instanceof Error && err.message) throw err;
        }
      }
      throw new Error('استجابة غير صالحة: الخادم لم يُرجع ملف PDF صالحاً');
    }

    const blob = await res.blob();
    if (!blob || blob.size < 5) {
      throw new Error('ملف PDF المستلم فارغ أو غير مكتمل');
    }
    if (typeof blob.slice === 'function') {
      const head = await blob.slice(0, 5).text();
      if (!head.startsWith('%PDF-')) {
        throw new Error('تنسيق ملف PDF المستلم غير صالح');
      }
    }

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = payload.filename || `exam-${payload.mode}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
    return { downloaded: true };
  }

  // Reusable Private Layout Templates
  async getLayoutTemplates(): Promise<LayoutTemplate[]> {
    return this.request('/api/worker/layout-templates');
  }

  async saveLayoutTemplate(payload: {
    id?: string;
    name: string;
    nameAr: string;
    description?: string;
    layoutConfig: ExamLayoutConfig;
  }): Promise<{ success: boolean; template: LayoutTemplate }> {
    return this.request('/api/worker/layout-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteLayoutTemplate(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/layout-templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async generateExamWithAI(params: any): Promise<{ success: boolean; exam: Exam; modelUsed: string; qualityReport: QualityValidationReport }> {
    return this.request('/api/worker/exams/generate-ai', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async validateExam(sections: any[], totalMarks: number, grade: string): Promise<QualityValidationReport> {
    return this.request('/api/worker/exams/validate', {
      method: 'POST',
      body: JSON.stringify({ sections, totalMarks, grade }),
    });
  }

  // Archive
  async getArchive(): Promise<Exam[]> {
    return this.request('/api/worker/archive');
  }

  async restoreExam(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/archive/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
    });
  }

  // AI Settings & Diagnostics (Owner Only)
  async getAISettings(): Promise<AISettingsState> {
    return this.request('/api/worker/ai/settings');
  }

  async updateAISettings(settings: Partial<AISettingsState>): Promise<{ success: boolean; settings: AISettingsState }> {
    return this.request('/api/worker/ai/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getAIModels(): Promise<any[]> {
    return this.request('/api/worker/ai/models');
  }

  async pingAI(model?: string): Promise<{ success: boolean; model: string; latencyMs: number; message: string }> {
    return this.request('/api/worker/ai/ping', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
  }

  async getAILogs(): Promise<AIUsageLog[]> {
    return this.request('/api/worker/ai/logs');
  }

  // System & Users
  async getColleagues(): Promise<{ id: string; name: string; username: string; role: string }[]> {
    return this.request('/api/worker/system/colleagues');
  }

  async getUsers(): Promise<User[]> {
    return this.request('/api/worker/system/users');
  }

  async createUser(userData: any): Promise<{ success: boolean; user: User }> {
    return this.request('/api/worker/system/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async updateUser(userId: string, patch: Partial<User>): Promise<{ success: boolean; user: User }> {
    return this.request(`/api/worker/system/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  }

  async getAuditLogs(): Promise<any[]> {
    return this.request('/api/worker/system/audit-logs');
  }

  // Owner Registration Requests, Account Lifecycle & Control Center
  async getRegistrationRequests(status?: string): Promise<RegistrationRequest[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    const result = await this.request<{ requests: RegistrationRequest[] }>(`/api/worker/owner/registration-requests${q}`);
    return result.requests || [];
  }

  async approveRegistrationRequest(
    id: string,
    overrides?: {
      role?: 'Teacher' | 'SchoolAdmin';
      assignedSubjects?: string[];
      assignedGrades?: string[];
      reviewNote?: string;
    }
  ): Promise<{ success: boolean; request: RegistrationRequest; user: User }> {
    return this.request(`/api/worker/owner/registration-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(overrides || {}),
    });
  }

  async rejectRegistrationRequest(id: string, reviewNote: string): Promise<{ success: boolean; request: RegistrationRequest }> {
    return this.request(`/api/worker/owner/registration-requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reviewNote }),
    });
  }

  async requestEditRegistration(id: string, reviewNote: string): Promise<{ success: boolean; request: RegistrationRequest }> {
    return this.request(`/api/worker/owner/registration-requests/${encodeURIComponent(id)}/needs-edit`, {
      method: 'POST',
      body: JSON.stringify({ reviewNote }),
    });
  }

  async suspendUser(userId: string, reason: string): Promise<{ success: boolean; user: User }> {
    return this.request(`/api/worker/owner/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async reactivateUser(userId: string): Promise<{ success: boolean; user: User }> {
    return this.request(`/api/worker/owner/users/${encodeURIComponent(userId)}/reactivate`, {
      method: 'POST',
    });
  }

  async getOwnerControlCenter(): Promise<any> {
    return this.request('/api/worker/owner/control-center');
  }

  async getOwnerAuditLogs(filters?: {
    category?: string;
    severity?: string;
    userId?: string;
    search?: string;
    limit?: number;
  }): Promise<{
    logs: AuditLogEntry[];
    integrity: { valid: boolean; chainedCount: number; legacyCount: number; brokenEntryIds: string[] };
  }> {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.userId) params.set('userId', filters.userId);
    if (filters?.search) params.set('search', filters.search);
    if (filters?.limit) params.set('limit', String(filters.limit));
    const q = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/worker/owner/audit-logs${q}`);
  }

  private async downloadAuthorizedFile(url: string, fallbackFilename: string): Promise<void> {
    const token = this.authToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('abuhussam_auth_token') || '' : '');
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (res.status === 401) {
      this.triggerUnauthorized(401, url);
      throw new Error('جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً');
    }

    if (!res.ok) {
      let errMsg = 'فشل تنزيل الملف المطلوب';
      try {
        const rawErr = await res.text();
        const trimmedErr = rawErr.trimStart();
        if (trimmedErr && !trimmedErr.startsWith('<')) {
          const parsedErr = JSON.parse(rawErr);
          if (parsedErr?.error) errMsg = parsedErr.error;
        } else if (trimmedErr.startsWith('<')) {
          errMsg = 'استجاب الخادم بصفحة HTML غير متوقعة أثناء تنزيل الملف';
        }
      } catch {
        // fallback to default error message
      }
      throw new Error(errMsg);
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error('استجاب الخادم بصفحة HTML غير متوقعة بدلاً من الملف المطلوب');
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      throw new Error('الملف المستلم من الخادم فارغ');
    }
    if (typeof blob.slice === 'function') {
      const preview = (await blob.slice(0, 64).text()).trimStart().toLowerCase();
      if (preview.startsWith('<!doctype') || preview.startsWith('<html')) {
        throw new Error('استجاب الخادم بصفحة HTML غير متوقعة بدلاً من الملف المطلوب');
      }
    }

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  }

  async downloadOwnerAuditLogs(format: 'csv' | 'json'): Promise<void> {
    return this.downloadAuthorizedFile(
      `/api/worker/owner/audit-logs/export?format=${format}`,
      `qaflah-audit-log.${format}`
    );
  }

  async getStorageStatus(): Promise<any> {
    return this.request('/api/worker/system/storage-status');
  }

  async createBackup(): Promise<{ success: boolean; filename: string }> {
    return this.request('/api/worker/system/backup', {
      method: 'POST',
    });
  }

  async listBackups(): Promise<string[]> {
    return this.request('/api/worker/system/backups');
  }

  async downloadCurrentSnapshot(): Promise<void> {
    return this.downloadAuthorizedFile(
      '/api/worker/system/backup/download',
      `qaflah-snapshot-${Date.now()}.json`
    );
  }

  async downloadBackupFile(filename: string): Promise<void> {
    return this.downloadAuthorizedFile(
      `/api/worker/system/backups/${encodeURIComponent(filename)}/download`,
      filename
    );
  }

  async restoreBackup(filename: string): Promise<{ success: boolean }> {
    return this.request('/api/worker/system/restore', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    });
  }

  async restoreBackupFromUpload(content: string): Promise<{ success: boolean }> {
    return this.request('/api/worker/system/restore-upload', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // AI Vision & Image Analyzer (Owner Only)
  async analyzeImages(
    images: { dataUrl: string; name: string; mimeType: string }[],
    gradeHint?: GradeLevel,
    unitHint?: string
  ): Promise<{ success: boolean; result: ExtractedAnalysisResult; modelUsed: string }> {
    return this.request('/api/worker/vision/analyze', {
      method: 'POST',
      body: JSON.stringify({ images, gradeHint, unitHint }),
    });
  }

  async generateQuestionsFromImages(params: {
    analysis: ExtractedAnalysisResult;
    grade: GradeLevel;
    contentScope: ContentScope;
    educationalLevel: EducationalLevel;
    selectedQuestionTypes: QuestionType[];
    count: number;
    teacherNotes?: string;
    saveToBank?: boolean;
  }): Promise<{ success: boolean; questions: Question[]; modelUsed: string }> {
    return this.request('/api/worker/vision/generate-questions', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async validateSourceFidelity(params: {
    question: Question;
    analysis: ExtractedAnalysisResult;
    contentScope?: ContentScope;
  }): Promise<SemanticFidelityReport & { success: boolean }> {
    return this.request('/api/worker/vision/validate-fidelity', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Analyzed Documents Library (Owner Only)
  async getAnalyzedDocuments(): Promise<AnalyzedDocument[]> {
    return this.request('/api/worker/documents');
  }

  async getAnalyzedDocumentById(id: string): Promise<AnalyzedDocument> {
    return this.request(`/api/worker/documents/${encodeURIComponent(id)}`);
  }

  async saveAnalyzedDocument(doc: Partial<AnalyzedDocument>): Promise<{ success: boolean; document: AnalyzedDocument }> {
    return this.request('/api/worker/documents', {
      method: 'POST',
      body: JSON.stringify(doc),
    });
  }

  async deleteAnalyzedDocument(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/worker/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiService();
