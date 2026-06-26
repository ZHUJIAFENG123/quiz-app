@echo off
title 刷题宝典 - 线上模式
echo ========================================
echo     刷题宝典 - 生产环境启动
echo ========================================

cd /d "%~dp0backend"

echo [1/2] 启动后端服务器 (端口 8080)...
set NODE_ENV=production
REM 请在 backend/.env 中配置 JWT_SECRET 和 AI_API_KEY
REM 参考 backend/.env.example 文件
start "刷题宝典-后端" cmd /c "node server.js"

echo 等待服务启动...
timeout /t 3 /nobreak >nul

echo [2/2] 启动内网穿透...
start "刷题宝典-隧道" cmd /c "lt --port 8080"

echo.
echo ========================================
echo   启动完成！
echo.
echo   等待隧道连接成功后，终端会显示访问地址
echo   格式类似: https://xxx.loca.lt
echo.
echo   复制这个地址发给女朋友即可
echo.
echo   注意：此窗口可以关闭，但不要关掉
echo   弹出的两个命令行窗口！
echo ========================================
pause
