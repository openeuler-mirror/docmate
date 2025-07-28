# DocMate Backend Service

DocMate后端服务，提供openEuler认证和AI代理功能。

## 功能特性

- 🔐 **openEuler OAuth2.0认证**：集成openEuler官方认证系统
- 🛡️ **安全代理**：安全地代理AI服务请求
- 🔑 **JWT Token管理**：生成和验证访问令牌
- 📝 **API接口**：提供文档处理相关的API接口

## 快速开始

### 环境要求

- Python 3.8+
- pip 或 poetry

### 安装依赖

```bash
# 进入后端目录
cd packages/backend

# 安装Python依赖
pip install -r requirements.txt
```

### 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑.env文件，填入必要的配置
```

### 启动服务

```bash
# 开发模式启动
pnpm run dev

# 或者直接使用uvicorn
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 验证服务

访问 http://localhost:8000 查看服务状态。

访问 http://localhost:8000/docs 查看API文档。

## API接口

### 健康检查

- `GET /` - 基础健康检查
- `GET /health` - 详细健康检查

### 认证接口

- `GET /auth/status` - 认证服务状态
- `POST /auth/login` - 用户登录
- `POST /auth/logout` - 用户登出

### 业务接口

- `GET /api/v1/status` - API服务状态
- `POST /api/v1/check` - 文本检查
- `POST /api/v1/polish` - 文本润色
- `POST /api/v1/translate` - 文本翻译
- `POST /api/v1/rewrite` - 文本改写

## 开发指南

### 项目结构

```
packages/backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI应用入口
│   ├── core/                # 核心模块
│   │   ├── config.py        # 配置管理
│   │   └── logger.py        # 日志配置
│   └── routers/             # API路由
│       ├── auth.py          # 认证路由
│       └── api.py           # 业务路由
├── requirements.txt         # Python依赖
├── .env.example            # 环境变量模板
└── README.md               # 说明文档
```

### 环境变量说明

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `JWT_SECRET_KEY` | JWT密钥 | 必填 |
| `OPENEULER_CLIENT_ID` | openEuler客户端ID | 必填 |
| `OPENEULER_CLIENT_SECRET` | openEuler客户端密钥 | 必填 |
| `AI_API_KEY` | AI服务API密钥 | 必填 |
| `HOST` | 服务监听地址 | 0.0.0.0 |
| `PORT` | 服务监听端口 | 8000 |
| `DEBUG` | 调试模式 | false |

## 部署

### Docker部署

```bash
# 构建镜像
docker build -t docmate-backend .

# 运行容器
docker run -p 8000:8000 --env-file .env docmate-backend
```

### 生产环境

```bash
# 生产模式启动
pnpm run start
```

## 许可证

MIT License
