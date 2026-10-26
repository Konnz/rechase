# Einmalige Einrichtung auf dem VPS

Gilt für re:chase nach dem VPS-Standard. `rechase.example.com` überall durch die echte Domain ersetzen. Je Codeblock genau ein Befehl.

## 1. DNS

A-Record (und ggf. AAAA) der Domain auf `85.190.98.62` setzen.

## 2. Nutzer und Ordner

```bash
sudo useradd -m -s /bin/bash -G docker rechase
```

```bash
sudo install -d -o rechase -g rechase -m 750 /opt/rechase
```

```bash
printf 'APP_IMAGE=ghcr.io/konnz/rechase\nAPP_TAG=latest\nAPP_HOST_PORT=3150\n' | sudo -u rechase tee /opt/rechase/.env >/dev/null
```

```bash
sudo chmod 600 /opt/rechase/.env
```

## 3. Deploy-Schlüssel

```bash
sudo -u rechase install -d -m 700 /home/rechase/.ssh
```

```bash
sudo -u rechase ssh-keygen -t ed25519 -N '' -C rechase-deploy -f /home/rechase/.ssh/id_deploy
```

```bash
sudo -u rechase sh -c 'cat ~/.ssh/id_deploy.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

Privaten Schlüssel anzeigen und als GitHub-Secret `VPS_SSH_KEY` speichern:

```bash
sudo cat /home/rechase/.ssh/id_deploy
```

Danach vom Server löschen:

```bash
sudo rm /home/rechase/.ssh/id_deploy
```

Host-Schlüssel für das Secret `VPS_KNOWN_HOSTS` (auf deinem Rechner ausführen):

```bash
ssh-keyscan -p 22 85.190.98.62
```

## 4. GitHub (Repo → Settings → Secrets and variables → Actions)

- Secret `VPS_SSH_KEY`: privater Schlüssel aus Schritt 3
- Secret `VPS_KNOWN_HOSTS`: Ausgabe von `ssh-keyscan`
- Variable `VPS_HOST`: `85.190.98.62` (erst setzen, wenn alles andere steht; ohne sie wird nur gebaut)

## 5. nginx und TLS

Inhalt von `deploy/nginx/rechase` (mit echter Domain) nach `/etc/nginx/sites-available/rechase` kopieren, z. B. mit:

```bash
sudo nano /etc/nginx/sites-available/rechase
```

```bash
sudo ln -s /etc/nginx/sites-available/rechase /etc/nginx/sites-enabled/rechase
```

```bash
sudo nginx -t
```

```bash
sudo systemctl reload nginx
```

```bash
sudo certbot --nginx -d rechase.example.com
```

## 6. Erster Deploy

PR mergen oder in GitHub unter Actions → Deploy → „Run workflow“ starten. Danach prüfen:

```bash
curl -s https://rechase.example.com/healthz
```
