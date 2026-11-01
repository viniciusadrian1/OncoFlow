@echo off
cd /d "%~dp0"
echo Abrindo OncoFlow Casa. Mantenha esta janela aberta durante a demonstracao.
py -3 server.py --open %*
pause
