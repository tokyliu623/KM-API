export function getFriendlyError(errorMsg: string): string {
  const errorMap: Record<string, string> = {
    'unauthorized': '未授权访问，请检查 Token 是否有效',
    'invalid_token': 'Token 无效或已过期',
    'token_expired': 'Token 已过期，请重新获取',
    'kb_not_found': '知识库不存在或无权访问',
    'content_not_found': '内容不存在',
    'rate_limit': '请求过于频繁，请稍后再试',
    'network_error': '网络连接失败，请检查网络',
    'server_error': '服务器内部错误，请稍后重试',
    'invalid_request': '请求参数错误',
    'forbidden': '无权执行此操作',
  };

  const lowerMsg = errorMsg.toLowerCase();
  for (const [key, friendly] of Object.entries(errorMap)) {
    if (lowerMsg.includes(key)) {
      return friendly;
    }
  }

  return '操作失败，请稍后重试';
}

export function getErrorCode(errorMsg: string): string {
  const codeMap: Record<string, string> = {
    'unauthorized': 'AUTH_001',
    'invalid_token': 'AUTH_002',
    'token_expired': 'AUTH_003',
    'kb_not_found': 'KB_001',
    'content_not_found': 'KB_002',
    'rate_limit': 'RATE_001',
    'network_error': 'NET_001',
    'server_error': 'SRV_001',
    'invalid_request': 'REQ_001',
    'forbidden': 'AUTH_004',
  };

  const lowerMsg = errorMsg.toLowerCase();
  for (const [key, code] of Object.entries(codeMap)) {
    if (lowerMsg.includes(key)) {
      return code;
    }
  }

  return 'UNKNOWN';
}