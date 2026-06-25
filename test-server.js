const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const LLM_API_URL = process.env.LLM_API_URL || 'http://jiuwen-api.vmic.xyz/v1/chat-messages';
const LLM_API_KEY = process.env.LLM_API_KEY || '';

console.log('=== KM-API 诊断 ===');
console.log('LLM_API_URL:', LLM_API_URL);
console.log('LLM_API_KEY:', LLM_API_KEY ? LLM_API_KEY.substring(0, 10) + '...' : 'EMPTY');

app.post('/api/test-env', (req, res) => {
  res.json({
    LLM_API_URL: LLM_API_URL,
    LLM_API_KEY: LLM_API_KEY ? LLM_API_KEY.substring(0, 10) + '...' : 'EMPTY',
  });
});

app.post('/api/llm/translate', async (req, res) => {
  const { prompt } = req.body;

  console.log('=== 翻译请求 ===');
  console.log('prompt:', prompt);
  console.log('LLM_API_URL:', LLM_API_URL);
  console.log('LLM_API_KEY:', LLM_API_KEY ? LLM_API_KEY.substring(0, 10) + '...' : 'EMPTY');

  if (!prompt) {
    res.json({ success: false, error: 'prompt is required' });
    return;
  }

  const requestBody = {
    query: prompt,
    inputs: {},
    response_mode: 'blocking',
    user: 'km-api',
  };

  console.log('请求体:', JSON.stringify(requestBody));

  try {
    console.log('开始调用九问 API...');
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('响应状态:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('错误响应体:', errorText);
      res.json({ success: false, error: `API error: ${response.status}`, details: errorText });
      return;
    }

    const data = await response.json();
    console.log('成功响应:', JSON.stringify(data));

    const content = data.answer || '';
    res.json({ success: true, data: { content } });
  } catch (err) {
    console.error('异常:', err.message);
    res.json({ success: false, error: err.message });
  }
});

app.listen(5053, () => {
  console.log('测试服务器运行在端口 5053');
});