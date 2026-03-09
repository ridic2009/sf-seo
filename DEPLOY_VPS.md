# Site Factory: deploy на VPS Ubuntu 22.04

Инструкция рассчитана на чистый VPS Ubuntu 22.04 и домен sf-seo.sbs.

## 1. Что будет в проде

- Домен: sf-seo.sbs
- Reverse proxy: Nginx
- Backend: Node.js service через systemd
- Frontend: статически раздаётся самим Fastify из client/dist
- База: SQLite в server/data/site-factory.db
- SSL: Let's Encrypt через certbot

## 2. Что нужно заменить перед деплоем

Проверь и замени следующие значения:

- YOUR_GITHUB_REPO_URL: URL твоего GitHub-репозитория, например https://github.com/username/site-factory.git
- YOUR_GITHUB_SSH_URL: SSH URL репозитория, если пушишь по SSH, например git@github.com:username/site-factory.git
- YOUR_GITHUB_USERNAME: имя пользователя GitHub
- YOUR_GITHUB_EMAIL: почта GitHub для коммитов
- VPS_IP: IP твоего сервера
- VPS_USER: пользователь на VPS, лучше отдельный user, например deploy
- SSH_PRIVATE_KEY_PATH: путь к приватному SSH-ключу на локальной машине, если используешь SSH
- LETSENCRYPT_EMAIL: твой email для SSL-сертификата
- ADMIN_PASSWORD_HASH: scrypt-хеш пароля администратора приложения
- AUTH_SESSION_SECRET: длинная случайная строка для подписи cookie-сессий

Файл env для сервера:

- PORT=3001
- HOST=127.0.0.1
- CORS_ORIGIN=https://sf-seo.sbs
- SITE_PREVIEW_BROWSER_PATH=/usr/bin/chromium-browser
- ADMIN_USERNAME=admin
- ADMIN_PASSWORD_HASH=вставить_сгенерированный_scrypt_хеш
- AUTH_SESSION_SECRET=вставить_случайную_строку_не_короче_32_байт
- AUTH_COOKIE_NAME=sf_session
- AUTH_SESSION_TTL_HOURS=12
- AUTH_MAX_LOGIN_ATTEMPTS=5
- AUTH_LOGIN_BLOCK_MINUTES=15
- AUTH_LOGIN_WINDOW_MINUTES=15

## 3. Генерация пароля администратора и session secret

Сначала локально сгенерируй хеш пароля для приложения:

```powershell
Set-Location "C:\Users\danie\OneDrive\Рабочий стол\Инструмент\server"
npm run hash-password -- "СЮДА_ТВОЙ_СЛОЖНЫЙ_ПАРОЛЬ"
```

Скопируй вывод целиком. Это и есть значение для ADMIN_PASSWORD_HASH.

Для AUTH_SESSION_SECRET на VPS можно сгенерировать строку так:

```bash
openssl rand -hex 32
```

Пароль администратора должен быть длинным и уникальным. Минимум 20 символов, лучше парольная фраза или случайная строка из менеджера паролей.

## 4. Что не должно попасть на GitHub

Не пушь:

- .env
- server/data/
- любые sqlite-файлы: *.db, *.db-wal, *.db-journal
- локальные временные файлы из .tmp/
- node_modules/
- dist/

Причина: в SQLite лежат серверы, SSH-пароли, private keys, panel passwords и другие чувствительные данные.

## 5. Подготовка локального репозитория и push на GitHub

Если git ещё не инициализирован:

```powershell
Set-Location "C:\Users\danie\OneDrive\Рабочий стол\Инструмент"
git init
git config user.name "YOUR_GITHUB_USERNAME"
git config user.email "YOUR_GITHUB_EMAIL"
git branch -M main
git add .
git status
```

Перед первым коммитом убедись, что в staged нет:

- server/data/
- .env
- .tmp/
- node_modules/
- dist/

Если всё чисто:

```powershell
git commit -m "Prepare production deployment"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Если хочешь пушить по SSH:

```powershell
git remote add origin YOUR_GITHUB_SSH_URL
git push -u origin main
```

## 6. Подготовка DNS

У регистратора или DNS-провайдера создай A-запись:

- Host: @
- Type: A
- Value: VPS_IP

Опционально можно добавить:

- Host: www
- Type: A
- Value: VPS_IP

Проверка с локальной машины:

```powershell
nslookup sf-seo.sbs
```

## 7. Первичный вход на VPS

Подключение:

```bash
ssh root@VPS_IP
```

Обновление системы:

```bash
apt update
apt upgrade -y
timedatectl set-timezone Europe/Moscow
```

Создай отдельного пользователя для приложения:

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Проверь вход:

```bash
ssh deploy@VPS_IP
```

## 8. Установка системных пакетов

Под пользователем root или через sudo:

```bash
apt install -y curl git nginx ufw build-essential python3 make g++ unzip chromium-browser certbot python3-certbot-nginx
```

Открой firewall:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

## 9. Установка Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

## 10. Клонирование проекта на VPS

Под пользователем deploy:

```bash
sudo -iu deploy
cd /home/deploy
git clone YOUR_GITHUB_REPO_URL site-factory
cd /home/deploy/site-factory
```

Если используешь SSH-репозиторий, сначала добавь deploy-ключ на сервер и в GitHub.

## 11. Установка зависимостей и сборка

```bash
cd /home/deploy/site-factory
npm install
cd server
npm install
cd ../client
npm install
cd ..
npm run build
```

Проверка, что сборка успешна:

```bash
test -f /home/deploy/site-factory/server/dist/index.js && echo "server build ok"
test -f /home/deploy/site-factory/client/dist/index.html && echo "client build ok"
```

## 12. Создание production env

```bash
cd /home/deploy/site-factory
cp .env.example .env
nano .env
```

Содержимое .env:

```env
PORT=3001
HOST=127.0.0.1
CORS_ORIGIN=https://sf-seo.sbs
SITE_PREVIEW_BROWSER_PATH=/usr/bin/chromium-browser
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=ВСТАВЬ_СЮДА_ХЕШ_ИЗ_NPM_RUN_HASH_PASSWORD
AUTH_SESSION_SECRET=ВСТАВЬ_СЮДА_ВЫВОД_OPENSSL_RAND_HEX_32
AUTH_COOKIE_NAME=sf_session
AUTH_SESSION_TTL_HOURS=12
AUTH_MAX_LOGIN_ATTEMPTS=5
AUTH_LOGIN_BLOCK_MINUTES=15
AUTH_LOGIN_WINDOW_MINUTES=15
```

Почему HOST=127.0.0.1: backend не должен быть доступен напрямую из интернета, его будет проксировать Nginx.
Почему AUTH_SESSION_SECRET обязателен: без него нельзя безопасно подписывать cookie-сессии.
Почему ADMIN_PASSWORD_HASH хранится как хеш: пароль администратора не должен лежать в env в открытом виде.

## 13. Тестовый запуск приложения без systemd

```bash
cd /home/deploy/site-factory/server
node dist/index.js
```

В другом SSH-сеансе проверь:

```bash
curl http://127.0.0.1:3001/api/health
```

Ожидается JSON со status: ok.

Останови сервер через Ctrl+C.

## 14. Systemd service

Создай unit-файл:

```bash
sudo nano /etc/systemd/system/site-factory.service
```

Вставь:

```ini
[Unit]
Description=Site Factory Fastify Server
After=network.target

[Service]
Type=simple
User=deploy
Group=deploy
WorkingDirectory=/home/deploy/site-factory/server
EnvironmentFile=/home/deploy/site-factory/.env
ExecStart=/usr/bin/node /home/deploy/site-factory/server/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Далее:

```bash
sudo systemctl daemon-reload
sudo systemctl enable site-factory
sudo systemctl start site-factory
sudo systemctl status site-factory --no-pager
```

Логи:

```bash
sudo journalctl -u site-factory -n 100 --no-pager
```

## 15. Конфиг Nginx для домена

Создай конфиг:

```bash
sudo nano /etc/nginx/sites-available/sf-seo.sbs
```

Вставь:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name sf-seo.sbs www.sf-seo.sbs;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Активируй сайт:

```bash
sudo ln -s /etc/nginx/sites-available/sf-seo.sbs /etc/nginx/sites-enabled/sf-seo.sbs
sudo nginx -t
sudo systemctl reload nginx
```

Проверка:

```bash
curl -I http://sf-seo.sbs
curl http://sf-seo.sbs/api/health
```

## 16. SSL через Let's Encrypt

Когда DNS уже смотрит на VPS:

```bash
sudo certbot --nginx -d sf-seo.sbs -d www.sf-seo.sbs -m LETSENCRYPT_EMAIL --agree-tos --no-eff-email --redirect
```

Проверка автопродления:

```bash
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

## 17. Проверка production после SSL

```bash
curl -I https://sf-seo.sbs
curl https://sf-seo.sbs/api/health
```

Проверь в браузере:

- https://sf-seo.sbs
- https://sf-seo.sbs/api/health

## 18. Первый вход в приложение

После запуска сначала открой приложение и авторизуйся под ADMIN_USERNAME и паролем, от которого ты сгенерировал ADMIN_PASSWORD_HASH.

Приложение теперь:

- закрыто cookie-сессией с флагом httpOnly
- использует подписанную session cookie
- ограничивает попытки входа по IP
- временно блокирует brute force после серии неудачных попыток

После запуска приложение будет пустым. Это нормально.

В интерфейсе тебе нужно вручную:

- загрузить шаблоны
- добавить целевые серверы
- ввести SSH credentials или private key
- при необходимости указать panel credentials

Важно: все эти данные хранятся в локальной SQLite-базе на VPS:

- /home/deploy/site-factory/server/data/site-factory.db

Сделай резервную копию сразу после первичной настройки:

```bash
mkdir -p /home/deploy/backups
cp /home/deploy/site-factory/server/data/site-factory.db /home/deploy/backups/site-factory.db.$(date +%F-%H%M%S)
```

## 19. Обновление приложения после новых коммитов

Под пользователем deploy:

```bash
cd /home/deploy/site-factory
git pull origin main
npm install
cd server
npm install
cd ../client
npm install
cd ..
npm run build
sudo systemctl restart site-factory
sudo systemctl status site-factory --no-pager
```

## 20. Полезные команды диагностики

Статус сервиса:

```bash
sudo systemctl status site-factory --no-pager
```

Логи backend:

```bash
sudo journalctl -u site-factory -f
```

Проверка порта:

```bash
ss -tulpn | grep 3001
```

Проверка Nginx:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
```

Проверка DNS:

```bash
dig +short sf-seo.sbs
```

## 21. Что важно учесть именно в этом проекте

- Fastify сам раздаёт client/dist, поэтому отдельный frontend-сервер не нужен.
- Клиент ходит на backend через /api, поэтому VITE_API_URL не требуется.
- Для генерации превью нужен установленный браузер. В этой инструкции используется chromium-browser.
- SQLite и template storage лежат в server/data, поэтому этот каталог нельзя удалять между деплоями.
- В базе хранятся SSH-пароли, private keys и panel passwords. Доступ к VPS и бэкапам должен быть строго ограничен.
- Без ADMIN_PASSWORD_HASH и AUTH_SESSION_SECRET backend в production не стартует. Это сделано специально.

## 22. Короткий чек-лист перед запуском

- DNS A-запись sf-seo.sbs указывает на VPS
- репозиторий запушен без server/data и без .env
- на VPS установлен Node.js 22, nginx, chromium-browser, certbot
- файл /home/deploy/site-factory/.env создан
- ADMIN_PASSWORD_HASH и AUTH_SESSION_SECRET заполнены
- systemd service запущен
- nginx config активирован
- SSL выпущен
- /api/health отвечает через https
