CREATE TABLE sms_send_usage (
  day TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts > 0)
);
CREATE INDEX sms_send_usage_month ON sms_send_usage(month);
