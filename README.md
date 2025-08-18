# 🚀 FlowDeskAI

FlowDeskAI est une plateforme intelligente de gestion des demandes internes (RH, IT, Logistique, Réclamations), intégrant un chatbot IA multi-canal (Webchat + WhatsApp), un système de tickets, un dashboard de gestion et des automatisations avec **n8n**.  

## 📑 Table des matières
1. Fonctionnalités principales
2. Architecture
3. Technologies utilisées
4. Installation en local
5. Déploiement avec Docker & Azure
6. Utilisation
7. Auteurs

---

## ✨ Fonctionnalités principales

- **Chatbot IA** : Compréhension des intentions utilisateurs (spaCy + GPT-4).
- **Multi-canal** : Webchat et WhatsApp (API Meta/Twilio).
- **Tickets dynamiques** : Création, suivi, mise à jour, suppression.
- **Dashboard** : Vue en temps réel des tickets par service et priorité.
- **Automatisations n8n** : Rappels, notifications, génération de rapports automatiques.
- **Monitoring** : Prometheus + Grafana.
- **Analyse IA** : Statistiques et insights pour la direction.

---

## 🛠 Architecture

Frontend (React.js + TailwindCSS)
|
Backend API (Node.js/Express)
|
PostgreSQL Database
|
n8n Automation + AI
|
Azure Cloud Infrastructure




---

## 🧰 Technologies utilisées

### **Développement**
- **Frontend** : React.js, Tailwind CSS, Lucide Icons
- **Backend** : Node.js, Express.js, REST API
- **Base de données** : PostgreSQL
- **IA & NLP** : OpenAI GPT-4, spaCy
- **Automatisation** : n8n

### **DevOps / Cloud**
- **Conteneurisation** : Docker, Docker Compose
- **Cloud Provider** : Azure App Service, Azure PostgreSQL Database
- **Infrastructure as Code** : Terraform
- **Secrets Management** : Azure Key Vault
- **CI/CD** : GitHub Actions
- **Monitoring** : Prometheus, Grafana

---

## 💻 Installation en local

### 1. Cloner le dépôt
```bash
git clone https://github.com/tahaakml/flowdeskai.git
cd flowdeskai
```

### 2. Configurer les variables d'environnement

Créer un fichier .env à la racine du backend :

DATABASE_URL=postgres://flowuser:flowpass@db:5432/flowdesk
PORT=4000

Pour le frontend :

Copier le code
REACT_APP_API_URL=http://localhost:4000/api

### 3. Lancer avec Docker Compose

docker compose up --build

📌 Les services frontend, backend et base de données démarreront ensemble.


## ☁ Déploiement avec Docker & Azure


1. Provisionner l’infrastructure avec Terraform :

- Azure App Service

- Azure PostgreSQL Database

- Azure Key Vault

2. Conteneuriser l’application avec Docker et la déployer dans l’infrastructure provisionnée.

3. Configurer un pipeline CI/CD GitHub Actions pour les déploiements automatiques.



## 🎯 Utilisation

Accéder au Frontend : http://localhost:3000

API Backend : http://localhost:4000/api/tickets

Tableau de bord n8n : http://localhost:5678


## 👤 Auteur

Taha KAMAL 
Ingénierie logicielle | DevOps | Intelligence Artificielle 