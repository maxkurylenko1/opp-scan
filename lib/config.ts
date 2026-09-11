export const config = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  openAiKey: process.env.OPENAI_API_KEY || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  cronSecret: process.env.CRON_SECRET || "",
};

export const hasSupabase = Boolean(config.supabaseUrl && config.serviceRoleKey);
