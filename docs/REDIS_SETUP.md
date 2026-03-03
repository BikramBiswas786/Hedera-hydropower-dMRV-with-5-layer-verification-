# Redis Production Setup
## Option 1: Docker
docker run -d --name redis-mrv -p 6379:6379 redis:7-alpine
## Option 2: Managed Service
- Heroku Redis
- AWS ElastiCache
- Redis Cloud
## Environment Variable
REDIS_URL=redis://your-redis-host:6379
