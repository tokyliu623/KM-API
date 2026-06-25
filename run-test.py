import os
import json
import subprocess
import time
import requests

os.environ['LLM_API_URL'] = 'http://jiuwen-api.vmic.xyz/v1/chat-messages'
os.environ['LLM_API_KEY'] = 'app-o9H3eKSdVRMxDH8KaVWqdboe'

print('=== 启动测试服务器 ===')
print(f"LLM_API_URL: {os.environ['LLM_API_URL']}")
print(f"LLM_API_KEY: {os.environ['LLM_API_KEY'][:10]}...")

proc = subprocess.Popen(
    ['node', 'D:/Users/11033406/【01】Projects/KM-API/test-server.js'],
    env=dict(os.environ),
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

print('等待服务器启动...')
time.sleep(3)

print('\n=== 测试翻译接口 ===')
try:
    r = requests.post('http://localhost:5053/api/llm/translate', json={'prompt': '你好'}, timeout=30)
    print(f"状态码: {r.status_code}")
    print(f"响应: {r.text}")
except Exception as e:
    print(f"请求失败: {e}")

print('\n=== 服务器日志 ===')
proc.terminate()
for line in proc.stdout:
    print(line, end='')