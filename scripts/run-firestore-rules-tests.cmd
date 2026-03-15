@echo off
setlocal
set "JAVA_HOME=C:\Java\jdk-21.0.6+7"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo Using JAVA_HOME=%JAVA_HOME%
where java
java -version
firebase emulators:exec --only firestore "node tests/firestore.rules.test.mjs"
exit /b %ERRORLEVEL%
