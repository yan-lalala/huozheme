@echo off
chcp 65001 >nul
title 活着么 · 平安守护服务

echo =======================================================
echo          🌱 正在启动「活着么」平安守护服务...
echo =======================================================
echo.

cd /d "%~dp0"

echo 正在启动本地服务 (端口 3000)...
start http://localhost:3000
node server/index.js

pause
