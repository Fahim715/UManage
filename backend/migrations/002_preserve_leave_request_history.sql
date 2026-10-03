-- Keep leave history when a user account is removed. Applications should
-- deactivate users with historical requests rather than deleting their data.
ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_user_id_fkey;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;
