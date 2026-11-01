CREATE TABLE support_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number varchar(12) NOT NULL UNIQUE,
 buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 assignee_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 create_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
 subject_ciphertext bytea NOT NULL, reference_ciphertext bytea NOT NULL,
 topic varchar(24) NOT NULL CHECK (topic IN ('bidding','payments','wallet','withdrawals','pickup','condition','account','other')),
 status varchar(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved')),
 mode varchar(16) NOT NULL DEFAULT 'assistant' CHECK (mode IN ('assistant','human')),
 version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
 created_at timestamptz(3) NOT NULL DEFAULT now(), updated_at timestamptz(3) NOT NULL DEFAULT now(),
 UNIQUE(created_by_id,create_key)
);
CREATE INDEX support_conversations_buyer_id_status_updated_at_id_idx ON support_conversations(buyer_id,status,updated_at,id);
CREATE INDEX support_conversations_buyer_id_updated_at_id_idx ON support_conversations(buyer_id,updated_at,id);
CREATE INDEX support_conversations_status_updated_at_id_idx ON support_conversations(status,updated_at,id);
CREATE INDEX support_conversations_updated_at_id_idx ON support_conversations(updated_at,id);
CREATE INDEX support_conversations_assignee_id_status_id_idx ON support_conversations(assignee_id,status,id);
CREATE TABLE support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 author_id uuid REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 kind varchar(16) NOT NULL CHECK (kind IN ('buyer','staff','assistant','system')),
 internal boolean NOT NULL DEFAULT false,
 body_ciphertext bytea NOT NULL, sequence integer NOT NULL CHECK (sequence >= 0), request_key uuid NOT NULL, request_hash varchar(64) NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT now(), UNIQUE(conversation_id,request_key), UNIQUE(conversation_id,sequence),
 CHECK (NOT internal OR kind IN ('staff','system')),
 CHECK ((kind IN ('buyer','staff')) = (author_id IS NOT NULL))
);
CREATE INDEX support_messages_conversation_id_internal_created_at_id_idx ON support_messages(conversation_id,internal,created_at,id);
CREATE INDEX support_messages_conversation_id_internal_sequence_idx ON support_messages(conversation_id,internal,sequence);
CREATE INDEX support_messages_author_id_created_at_id_idx ON support_messages(author_id,created_at,id);
CREATE TABLE support_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES support_messages(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 content_ciphertext bytea, object_key varchar(240) UNIQUE, bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 220000),
 CHECK ((content_ciphertext IS NULL) <> (object_key IS NULL))
);
CREATE INDEX support_attachments_message_id_id_idx ON support_attachments(message_id,id);
CREATE INDEX support_attachments_object_key_id_idx ON support_attachments(object_key,id);
CREATE TABLE support_presence (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 accepting boolean NOT NULL DEFAULT false, expires_at timestamptz(3) NOT NULL
);
CREATE INDEX support_presence_accepting_expires_at_idx ON support_presence(accepting,expires_at);
