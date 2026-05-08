// Set up mock environment variables before any tests run
// This is needed because the model extraction reads from env
process.env['GEMINI_API_KEY'] = 'test-gemini-key';
process.env['OPENAI_API_KEY'] = 'test-openai-key';
process.env['ANTHROPIC_API_KEY'] = 'test-anthropic-key';
