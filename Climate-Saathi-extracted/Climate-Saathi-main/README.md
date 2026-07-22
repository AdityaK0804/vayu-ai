# 🌍 Climate Saathi  
**Climate-Resilient Schools & Health Centres Platform (IoT + AI)** 


> Predict → Prevent → Protect  
> Turning climate risk into actionable intelligence for schools & PHCs

**🔗 [Live Demo](https://climate-saathi-2.vercel.app/)**
---
## 🚀 Overview

Climate Saathi is a full-stack climate resilience monitoring and early warning platform designed for government schools, PHCs, CHCs, and Anganwadis.

It combines:
- IoT sensor networks  
- Machine learning risk prediction  
- Satellite + climate data  
- Operational dashboards  
- Multi-channel alerting  

The goal:
Detect climate-driven failures **before they happen** and enable proactive action.

---

## 🎯 Problem Statement

Across regions like Chhattisgarh:

- Water systems fail silently  
- Solar infrastructure underperforms  
- Heat impacts vaccine storage  
- Sanitation issues disrupt schools  

These failures are:
- Reactive  
- Unmonitored  
- Discovered too late  

Climate Saathi creates a **predictive intelligence layer over infrastructure**.

---

## 💡 Solution

Climate Saathi is a **3-layer intelligent system**:

### 1. Data Layer (IoT + External APIs)
- ESP32 sensor nodes (water, energy, temperature, etc.)
- IMD weather data
- NASA POWER climate data
- CGWB groundwater datasets

### 2. AI/ML Layer
- Multi-label risk scoring (water, sanitation, energy, disease)
- 14-day forecasting (LSTM)
- PV anomaly detection (physics-based)
- SHAP explainability

### 3. Decision Layer
- Smart alerts (SMS, WhatsApp, IVR)
- Risk dashboards
- Facility digital twins
- Chatbot interface

---

## 🧠 Key Capabilities

- Real-time facility monitoring  
- Predictive risk scoring (7–14 days)  
- Explainable AI (SHAP insights)  
- District & facility-level dashboards  
- Automated alert escalation  
- Multilingual support (English, Hindi, Chhattisgarhi)  
- AI chatbot for querying data  

---

## 🏗️ System Architecture

Climate Saathi follows a 5-layer architecture:

1. Edge Layer – Sensors (ESP32 + LoRaWAN)  
2. Data Layer – TimescaleDB + PostgreSQL  
3. Analytics Layer – Feature engineering + ML pipelines  
4. Application Layer – APIs, alert engine, digital twin  
5. Presentation Layer – Dashboard, chatbot, mobile app  

---

## 🔬 Machine Learning Models

### Risk Scorer (LightGBM)
Predicts:
- Water risk  
- Sanitation risk  
- Energy risk  
- Disease risk  

### Water Forecasting (LSTM)
- 14-day prediction of water levels  
- Used for “days-to-critical” alerts  

### PV Anomaly Detection
- Physics-based model using irradiance + temperature  
- Detects solar inefficiency & faults  

### Fusion Engine
- Combines all models + sensor + climate data  
- Reduces false alerts  

---

## 🧩 Tech Stack

### Frontend
- Next.js 16, React 19, TypeScript  
- Tailwind CSS, shadcn/ui, Framer Motion  
- Mapbox / Leaflet, Recharts  

### Backend
- tRPC, Prisma, PostgreSQL  
- Redis, Supabase  
- FastAPI (ML services)  

### ML & Data
- Python, PyTorch, LightGBM  
- SHAP (Explainability)  
- Airflow (ETL pipelines)  

### Infra
- Docker + Kubernetes  
- TimescaleDB (time-series)  
- Kafka / MQTT  
- AWS / GCP  

---

## 📁 Project Structure

app/            → Frontend routes & UI  
components/     → Reusable UI components  
server/         → Backend logic (tRPC)  
lib/            → Utilities, auth, helpers  
ml/             → ML API + models  
scripts/        → Data seeding & preprocessing  
prisma/         → Database schema  
data/           → Climate datasets  

---

## ⚙️ Setup Instructions

### 1. Install & Run

```bash
npm install
npm run dev
