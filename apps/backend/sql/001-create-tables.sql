CREATE TABLE IF NOT EXISTS exercises (
  id VARCHAR(191) NOT NULL,
  inputMode ENUM(
    'SINGLE_CHOICE',
    'MULTIPLE_CHOICE',
    'TEXT',
    'NUMBER',
    'MATCH'
  ) NOT NULL,
  mobileSolvable BOOLEAN NOT NULL,
  learningLevel TINYINT UNSIGNED NOT NULL,
  difficulty TINYINT UNSIGNED NOT NULL,
  categories JSON NOT NULL,
  specializations JSON NOT NULL,
  instruction TEXT NOT NULL,
  images JSON NOT NULL,
  answerOptions JSON NOT NULL,
  matchOptions JSON NOT NULL,
  correct JSON NOT NULL,
  submitButton BOOLEAN NOT NULL,
  caseSensitive BOOLEAN NOT NULL,
  maximumStringDistance SMALLINT UNSIGNED NOT NULL,
  explainInstruction TEXT NOT NULL,
  explainAnswerOptions JSON NOT NULL,
  adminComment TEXT NOT NULL,
  adminTags JSON NOT NULL,
  contentRevision INT UNSIGNED NOT NULL DEFAULT 1,
  isActive BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX idx_exercises_active_mode (isActive, inputMode),
  CONSTRAINT chk_exercises_learning_level
    CHECK (learningLevel BETWEEN 1 AND 10),
  CONSTRAINT chk_exercises_difficulty
    CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT chk_exercises_categories
    CHECK (JSON_TYPE(categories) = 'ARRAY'),
  CONSTRAINT chk_exercises_specializations
    CHECK (JSON_TYPE(specializations) = 'ARRAY'),
  CONSTRAINT chk_exercises_correct
    CHECK (JSON_TYPE(correct) = 'ARRAY')
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
