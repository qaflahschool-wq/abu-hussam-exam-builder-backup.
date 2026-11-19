-- Migration 0003: Worker authentication lifecycle and durable edge rate limits.
-- This migration is additive and scoped to the isolated staging D1 database.

CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_pending_username
ON registration_requests(username COLLATE NOCASE)
WHERE status IN ('PENDING_APPROVAL', 'NEEDS_EDIT');

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  locked_until INTEGER
);

INSERT OR IGNORE INTO app_migrations (version, applied_at, checksum)
VALUES ('0003_auth_lifecycle', CURRENT_TIMESTAMP, 'auth-lifecycle-v1');
-- Seed the application's eight canonical subject choices so first-time teacher
-- registration can validate assignments before the full data import is run.
INSERT OR IGNORE INTO subjects (id, is_active, sort_order, record_json) VALUES
('subj-quran', 1, 1, json_object('id','subj-quran','code','QRN','nameAr','القرآن الكريم','nameEn','Quran','defaultDirection','rtl','isActive',true,'sortOrder',1,'isCore',true,'isQuran',true,'description','الحفظ والتسميع والتلاوة وإكمال الآيات ومعاني المفردات والتفسير','createdAt','2026-11-20T00:00:00.000Z')),
('subj-isl', 1, 2, json_object('id','subj-isl','code','ISL','nameAr','التربية الإسلامية','nameEn','Islamic Education','defaultDirection','rtl','isActive',true,'sortOrder',2,'isCore',true,'description','الحديث الشريف والفقه والسيرة النبوية والعقيدة والتهذيب','createdAt','2026-11-20T00:00:00.000Z')),
('subj-ar', 1, 3, json_object('id','subj-ar','code','ARB','nameAr','اللغة العربية','nameEn','Arabic Language','defaultDirection','rtl','isActive',true,'sortOrder',3,'isCore',true,'description','النحو والصرف والقراءة والنصوص والإملاء والتعبير','createdAt','2026-11-20T00:00:00.000Z')),
('subj-sci', 1, 4, json_object('id','subj-sci','code','SCI','nameAr','العلوم','nameEn','Science','defaultDirection','rtl','isActive',true,'sortOrder',4,'isCore',true,'description','العلوم العامة والفيزياء والكيمياء والأحياء المدرسية','createdAt','2026-11-20T00:00:00.000Z')),
('subj-soc', 1, 5, json_object('id','subj-soc','code','SOC','nameAr','الاجتماعيات','nameEn','Social Studies','defaultDirection','rtl','isActive',true,'sortOrder',5,'isCore',true,'description','التاريخ والجغرافيا والتربية الوطنية','createdAt','2026-11-20T00:00:00.000Z')),
('subj-en', 1, 6, json_object('id','subj-en','code','ENG','nameAr','اللغة الإنجليزية','nameEn','English Language','defaultDirection','ltr','isActive',true,'sortOrder',6,'isCore',true,'description','Crescent English Course for Yemen (Grades 7-9)','createdAt','2026-11-20T00:00:00.000Z')),
('subj-math', 1, 7, json_object('id','subj-math','code','MTH','nameAr','الرياضيات','nameEn','Mathematics','defaultDirection','rtl','isActive',true,'sortOrder',7,'isCore',false,'description','الجبر والهندسة والحساب والمعادلات الرياضية','createdAt','2026-11-20T00:00:00.000Z')),
('subj-cs', 1, 8, json_object('id','subj-cs','code','CS','nameAr','الحاسوب','nameEn','Computer Science','defaultDirection','rtl','isActive',true,'sortOrder',8,'isCore',false,'description','مبادئ الحاسوب وتطبيقاته التقنية','createdAt','2026-11-20T00:00:00.000Z'));
