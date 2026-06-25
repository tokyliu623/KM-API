const fetch = require('node-fetch');

const LLM_API_URL = 'http://jiuwen-api.vmic.xyz/v1/chat-messages';
const LLM_API_KEY = 'app-o9H3eKSdVRMxDH8KaVWqdboe';

async function testDirect() {
  console.log('=== 直接测试九问 API ===');
  console.log('URL:', LLM_API_URL);

  const requestBody = {
    query: '你好',
    inputs: {},
    response_mode: 'blocking',
    user: 'km-api-test',
  };

  console.log('请求体:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('响应状态:', response.status, response.statusText);
    console.log('响应头:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

    const text = await response.text();
    console.log('响应体:', text);

    const data = JSON.parse(text);
    console.log('解析后:', data);

  } catch (err) {
    console.error('错误:', err.message);
  }
}

testDirect();