-- 0004 identity: username-only accounts, four roles, MFA, security-question recovery, sessions,
-- anonymous identities. No PII column exists anywhere in this migration by design (rule 11).

CREATE TYPE role_name AS ENUM ('USER','REVIEWER','EDITOR','SUPER_ADMIN');

CREATE TABLE users (
  id                 bigserial PRIMARY KEY,
  username           citext      NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 32 AND username ~ '^[A-Za-z0-9_.-]+$'),
  password_hash      text        NOT NULL,      -- Argon2id PHC string
  leaderboard_opt_in boolean     NOT NULL DEFAULT false,
  disabled_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION kosh.set_updated_at();
CREATE TRIGGER users_no_delete BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();
COMMENT ON TABLE users IS 'Username + password only. No email, phone, name, DOB, location or photo column may ever be added (PROJECT_PRINCIPLES 11).';

CREATE TABLE security_questions (          -- generic, non-identifying prompts (Q3 §52)
  id      smallserial PRIMARY KEY,
  prompt  text NOT NULL UNIQUE,
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE user_security_answers (
  user_id      bigint   NOT NULL REFERENCES users(id),
  slot         smallint NOT NULL CHECK (slot BETWEEN 1 AND 3),
  question_id  smallint NOT NULL REFERENCES security_questions(id),
  answer_hash  text     NOT NULL,           -- Argon2id of case/whitespace-folded answer; never plaintext
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);

CREATE TABLE user_mfa (
  user_id               bigint PRIMARY KEY REFERENCES users(id),
  totp_secret_encrypted bytea  NOT NULL,       -- encrypted at rest with SESSION_SIGNING_KEY-derived key
  confirmed_at          timestamptz,
  recovery_codes_hash   text[] NOT NULL DEFAULT '{}',  -- one-time codes, hashed (software only; no hardware keys per Q2 §20)
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id          bigserial PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES users(id),
  role        role_name   NOT NULL,
  granted_by  bigint      REFERENCES users(id),      -- NULL only for the bootstrap SUPER_ADMIN
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  bigint      REFERENCES users(id),
  revoked_at  timestamptz,
  reason      text,
  CONSTRAINT user_roles_no_self_grant CHECK (granted_by IS NULL OR granted_by <> user_id)
);
CREATE UNIQUE INDEX user_roles_one_active_per_role ON user_roles (user_id, role) WHERE revoked_at IS NULL;
CREATE TRIGGER user_roles_no_delete BEFORE DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION kosh.forbid_delete();

-- Privileged roles require confirmed MFA BEFORE the grant takes effect (RISK_REGISTER R-14, R-17; SRS §40).
CREATE OR REPLACE FUNCTION kosh.require_mfa_for_privileged_role() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role IN ('EDITOR','SUPER_ADMIN') AND NEW.revoked_at IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_mfa m WHERE m.user_id = NEW.user_id AND m.confirmed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'role % requires confirmed MFA enrolment before it can be granted', NEW.role
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_roles_require_mfa BEFORE INSERT ON user_roles
  FOR EACH ROW EXECUTE FUNCTION kosh.require_mfa_for_privileged_role();

-- Did this user hold this role (or a superset) at a given instant? Used by decision triggers.
CREATE OR REPLACE FUNCTION kosh.user_had_role_at(p_user bigint, p_roles role_name[], p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles r
    WHERE r.user_id = p_user AND r.role = ANY (p_roles)
      AND r.granted_at <= p_at AND (r.revoked_at IS NULL OR r.revoked_at > p_at)
  );
$$;

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY,
  user_id             bigint      NOT NULL REFERENCES users(id),
  refresh_token_hash  bytea       NOT NULL UNIQUE,
  mfa_verified        boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  rotated_from        uuid REFERENCES sessions(id)
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- Anonymous contributor identities. Generated from a CSPRNG only; NO column exists for IP, device,
-- fingerprint or location, so none can be stored (rule 11; SRS §26).
CREATE TABLE anon_identities (
  id                bigserial PRIMARY KEY,
  label             text        NOT NULL UNIQUE CHECK (label ~ '^Anon-[0-9]{6}$'),
  claim_token_hash  bytea       NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER anon_identities_immutable BEFORE UPDATE OR DELETE ON anon_identities
  FOR EACH ROW EXECUTE FUNCTION kosh.forbid_mutation();

INSERT INTO security_questions (prompt) VALUES
  ('What is your favourite colour?'),
  ('What is your favourite food?'),
  ('What is your favourite place?'),
  ('What is your favourite season?'),
  ('What is your favourite number?'),
  ('What is your favourite flower or tree?');
