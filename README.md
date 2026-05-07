# 🛡️ VALYNT | Core

![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-003545?style=flat&logo=mariadb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

**VALYNT | Core** ist ein leistungsstarker, multifunktionaler Discord-Bot, der als All-in-One-Lösung für moderne Communities entwickelt wurde. Von einem komplexen Wirtschaftssystem über Stream-Benachrichtigungen bis hin zu einem dedizierten Web-Dashboard bietet VALYNT alles, was das Herz eines Server-Admins begehrt.

---

## ✨ Features

VALYNT deckt eine enorme Bandbreite an Funktionen ab, die alle bequem über das Dashboard konfiguriert werden können:

*   **💰 Wirtschaft & Level:** Eigenes Money-System inkl. Shop, Daily Streaks und automatischem Level-System.
*   **🛠️ Server Management:** Umfangreiches Log-System, Support-Tickets und spezialisierte "Nur-Bilder"-Channel.
*   **🎭 Team & Community:** Innovatives Abmeldungs- und Beförderungssystem für Server-Teams sowie ein Geburtstagssystem für die Community.
*   **📢 Stream Alerts:** Automatische Benachrichtigungen, sobald jemand auf **Twitch** oder **YouTube** live geht.
*   **⚙️ Dashboard:** Vollumfängliches Web-Interface unter [dev.valynt.net](https://dev.valynt.net) zur kinderleichten Konfiguration aller Module.
*   **🎮 Utility & Fun:** Willkommensnachrichten, mächtige Admin-Befehle und Minispiele wie das Emoji-Quiz.

---

## 🛠️ Tech Stack

*   **Sprache:** [TypeScript](https://www.typescriptlang.org/)
*   **Datenbank:** [MariaDB](https://mariadb.org/)
*   **Runtime:** [Node.js](https://nodejs.org/)
*   **Deployment:** [Docker](https://www.docker.com/)

---

## 📦 Installation & Setup

Das Hosting von VALYNT | Core ist dank Docker extrem simpel gehalten. 

### Voraussetzungen
*   Installiertes **Docker** & **Docker Compose**
*   Eine laufende **MariaDB** Instanz
*   Ein Discord Bot Token (erstellbar im [Discord Developer Portal](https://discord.com/developers/applications))

### Schritt-für-Schritt Anleitung

**1. Repository klonen**
```bash
git clone https://github.com/ItxLijan/Valynt-Bot.git
cd valynt-core
```

**2. Konfiguration (.env)**
Die benötigte `.env`-Datei ist bereits im Repository enthalten. Bitte öffne diese Datei mit einem Texteditor deiner Wahl und trage deine spezifischen Daten ein (z. B. `BOT_TOKEN`, `CLIENT_ID`, `DATABASE_URL`, etc.).

**3. Build & Start**
Sobald die Konfiguration abgeschlossen ist, kannst du das Docker-Image bauen und den Container im Hintergrund starten. Führe dazu einfach folgenden Befehl aus:

```bash
docker compose up -d --build
```

Das war's! Der Bot wird nun kompiliert, verbindet sich mit der Datenbank und geht online.

---

## 🔗 Links & Support

*   **Bot hinzufügen:** [Hole dir VALYNT auf deinen Server (Einladungslink)](https://dev.valynt.net/invite)
*   **Web-Dashboard:** [dev.valynt.net](https://dev.valynt.net)

---

## ⚖️ Lizenz

Dieses Projekt steht unter der **GPL-3.0 Lizenz**. Das bedeutet, du darfst den Code frei verwenden, verändern und weitergeben, solange abgeleitete Werke unter denselben Bedingungen veröffentlicht werden. Weitere Details findest du in der [LICENSE](LICENSE) Datei.

---

*Developed with ❤️ by the VALYNT Team.*
