-- Contato do funcionario (checklist do edital: informacoes basicas de contato)
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Contato da localidade atendida (responsavel, telefone e e-mail)
ALTER TABLE "gestao_os_buildings" ADD COLUMN IF NOT EXISTS "responsibleName" TEXT;
ALTER TABLE "gestao_os_buildings" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "gestao_os_buildings" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Equipes de servico
CREATE TABLE IF NOT EXISTS "gestao_os_teams" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "managerUserId" TEXT,
    "shift" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestao_os_teams_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gestao_os_teams_companyId_idx" ON "gestao_os_teams"("companyId");
CREATE INDEX IF NOT EXISTS "gestao_os_teams_name_idx" ON "gestao_os_teams"("name");
CREATE INDEX IF NOT EXISTS "gestao_os_teams_managerUserId_idx" ON "gestao_os_teams"("managerUserId");
CREATE INDEX IF NOT EXISTS "gestao_os_teams_isActive_idx" ON "gestao_os_teams"("isActive");

CREATE TABLE IF NOT EXISTS "gestao_os_team_members" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestao_os_team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_team_members_teamId_userId_key" ON "gestao_os_team_members"("teamId", "userId");
CREATE INDEX IF NOT EXISTS "gestao_os_team_members_teamId_idx" ON "gestao_os_team_members"("teamId");
CREATE INDEX IF NOT EXISTS "gestao_os_team_members_userId_idx" ON "gestao_os_team_members"("userId");

CREATE TABLE IF NOT EXISTS "gestao_os_team_buildings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestao_os_team_buildings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "gestao_os_team_buildings_teamId_buildingId_key" ON "gestao_os_team_buildings"("teamId", "buildingId");
CREATE INDEX IF NOT EXISTS "gestao_os_team_buildings_teamId_idx" ON "gestao_os_team_buildings"("teamId");
CREATE INDEX IF NOT EXISTS "gestao_os_team_buildings_buildingId_idx" ON "gestao_os_team_buildings"("buildingId");

-- Vinculo de equipe na OS e no agendamento
ALTER TABLE "gestao_os_work_orders" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "gestao_os_maintenance_plans" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

CREATE INDEX IF NOT EXISTS "gestao_os_work_orders_teamId_idx" ON "gestao_os_work_orders"("teamId");
CREATE INDEX IF NOT EXISTS "gestao_os_maintenance_plans_teamId_idx" ON "gestao_os_maintenance_plans"("teamId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_teams_companyId_fkey') THEN
    ALTER TABLE "gestao_os_teams" ADD CONSTRAINT "gestao_os_teams_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "gestao_os_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_teams_managerUserId_fkey') THEN
    ALTER TABLE "gestao_os_teams" ADD CONSTRAINT "gestao_os_teams_managerUserId_fkey"
      FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_team_members_teamId_fkey') THEN
    ALTER TABLE "gestao_os_team_members" ADD CONSTRAINT "gestao_os_team_members_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "gestao_os_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_team_members_userId_fkey') THEN
    ALTER TABLE "gestao_os_team_members" ADD CONSTRAINT "gestao_os_team_members_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_team_buildings_teamId_fkey') THEN
    ALTER TABLE "gestao_os_team_buildings" ADD CONSTRAINT "gestao_os_team_buildings_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "gestao_os_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_team_buildings_buildingId_fkey') THEN
    ALTER TABLE "gestao_os_team_buildings" ADD CONSTRAINT "gestao_os_team_buildings_buildingId_fkey"
      FOREIGN KEY ("buildingId") REFERENCES "gestao_os_buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_work_orders_teamId_fkey') THEN
    ALTER TABLE "gestao_os_work_orders" ADD CONSTRAINT "gestao_os_work_orders_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "gestao_os_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gestao_os_maintenance_plans_teamId_fkey') THEN
    ALTER TABLE "gestao_os_maintenance_plans" ADD CONSTRAINT "gestao_os_maintenance_plans_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "gestao_os_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Central de treinamentos
CREATE TABLE IF NOT EXISTS "training_courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "coverImageUrl" TEXT,
    "workloadHours" DOUBLE PRECISION,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_courses_title_idx" ON "training_courses"("title");
CREATE INDEX IF NOT EXISTS "training_courses_category_idx" ON "training_courses"("category");
CREATE INDEX IF NOT EXISTS "training_courses_isPublished_idx" ON "training_courses"("isPublished");
CREATE INDEX IF NOT EXISTS "training_courses_isActive_idx" ON "training_courses"("isActive");

CREATE TABLE IF NOT EXISTS "training_lessons" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT,
    "videoProvider" TEXT NOT NULL DEFAULT 'YOUTUBE',
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "durationMinutes" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_lessons_courseId_position_idx" ON "training_lessons"("courseId", "position");

CREATE TABLE IF NOT EXISTS "training_questions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_questions_courseId_position_idx" ON "training_questions"("courseId", "position");

CREATE TABLE IF NOT EXISTS "training_enrollments" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "bestScore" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_enrollments_courseId_userId_key" ON "training_enrollments"("courseId", "userId");
CREATE INDEX IF NOT EXISTS "training_enrollments_userId_idx" ON "training_enrollments"("userId");
CREATE INDEX IF NOT EXISTS "training_enrollments_courseId_idx" ON "training_enrollments"("courseId");
CREATE INDEX IF NOT EXISTS "training_enrollments_status_idx" ON "training_enrollments"("status");

CREATE TABLE IF NOT EXISTS "training_lesson_progress" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_lesson_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_lesson_progress_enrollmentId_lessonId_key" ON "training_lesson_progress"("enrollmentId", "lessonId");
CREATE INDEX IF NOT EXISTS "training_lesson_progress_enrollmentId_idx" ON "training_lesson_progress"("enrollmentId");
CREATE INDEX IF NOT EXISTS "training_lesson_progress_lessonId_idx" ON "training_lesson_progress"("lessonId");

CREATE TABLE IF NOT EXISTS "training_quiz_attempts" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_quiz_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_quiz_attempts_enrollmentId_createdAt_idx" ON "training_quiz_attempts"("enrollmentId", "createdAt");

CREATE TABLE IF NOT EXISTS "training_certificates" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "score" INTEGER,
    "workloadHours" DOUBLE PRECISION,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_certificates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "training_certificates_enrollmentId_key" ON "training_certificates"("enrollmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "training_certificates_code_key" ON "training_certificates"("code");
CREATE INDEX IF NOT EXISTS "training_certificates_code_idx" ON "training_certificates"("code");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_courses_createdById_fkey') THEN
    ALTER TABLE "training_courses" ADD CONSTRAINT "training_courses_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_lessons_courseId_fkey') THEN
    ALTER TABLE "training_lessons" ADD CONSTRAINT "training_lessons_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_questions_courseId_fkey') THEN
    ALTER TABLE "training_questions" ADD CONSTRAINT "training_questions_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_courseId_fkey') THEN
    ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_userId_fkey') THEN
    ALTER TABLE "training_enrollments" ADD CONSTRAINT "training_enrollments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_lesson_progress_enrollmentId_fkey') THEN
    ALTER TABLE "training_lesson_progress" ADD CONSTRAINT "training_lesson_progress_enrollmentId_fkey"
      FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_lesson_progress_lessonId_fkey') THEN
    ALTER TABLE "training_lesson_progress" ADD CONSTRAINT "training_lesson_progress_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "training_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_quiz_attempts_enrollmentId_fkey') THEN
    ALTER TABLE "training_quiz_attempts" ADD CONSTRAINT "training_quiz_attempts_enrollmentId_fkey"
      FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_certificates_enrollmentId_fkey') THEN
    ALTER TABLE "training_certificates" ADD CONSTRAINT "training_certificates_enrollmentId_fkey"
      FOREIGN KEY ("enrollmentId") REFERENCES "training_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
