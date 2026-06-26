@echo off
echo ========================================
echo     刷题宝典 - 一键启动脚本
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] 安装后端依赖...
cd backend
call npm install --silent
echo 后端依赖安装完成!

echo.
echo [2/4] 安装前端依赖...
cd ..\frontend
call npm install --silent
echo 前端依赖安装完成!

echo.
echo [3/4] 启动后端服务 (端口: 8080)...
REM 请在 backend/.env 中配置 JWT_SECRET 和 AI_API_KEY
REM 参考 backend/.env.example 文件
cd ..\backend
start "刷题宝典-后端" cmd /c "node server.js"

echo [4/4] 启动前端开发服务 (端口: 3000)...
cd ..\frontend
start "刷题宝典-前端" cmd /c "npx vite --host"

echo.
echo ========================================
echo   启动完成！
echo.
echo   前端地址: http://localhost:3000
echo   后端地址: http://localhost:8080
echo   管理后台: http://localhost:3000/#/admin
echo.
echo   按任意键退出...
echo ========================================
pause >nul
