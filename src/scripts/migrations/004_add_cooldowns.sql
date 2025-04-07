-- Add cooldown columns to users table
ALTER TABLE users 
ADD COLUMN last_scrape_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN last_analysis_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN scrape_cooldown_minutes INTEGER DEFAULT 1440, -- 24 hours
ADD COLUMN analysis_cooldown_minutes INTEGER DEFAULT 720; -- 12 hours

-- Add indexes for performance
CREATE INDEX idx_users_last_scrape_time ON users(last_scrape_time);
CREATE INDEX idx_users_last_analysis_time ON users(last_analysis_time); 