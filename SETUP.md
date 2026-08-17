# Omni-Queue 360 - System Setup Guide

This document provides detailed instructions for setting up and running the Omni-Queue 360 system on a local development environment for new team members.

---

## 1. Prerequisites

Before you begin, ensure your machine has the following tools installed:

- **Node.js**: Version 20 LTS or newer (required for the Backend API and all Front-end applications).
- **Python**: Version 3.10 or newer (required for the AI Engine).
- **PostgreSQL**: Version 14 or newer (if you prefer a local direct installation) or **Docker** (recommended) to run the database and Redis via containers.
- **Git**: To clone the repository.

---

## 2. PostgreSQL Local Setup

The Omni-Queue 360 system supports using an internal in-memory database for rapid development, but for the optimal production-like state, PostgreSQL is required.

### Option 1: Using Docker (Recommended)
You can simply run the following command to initialize PostgreSQL, Redis, and other infrastructure components:
```bash
npm run docker:up
```

### Option 2: Manual PostgreSQL Installation (No Docker)
1. Open **pgAdmin** or your **psql** terminal.
2. Create a new database for the project:
   ```sql
   CREATE DATABASE omniqueue;
   ```

### Environment Variables Configuration (.env)
Whether you use Docker or a manual installation, you must configure the Database connection string:
1. Navigate to the `apps/api-server` directory.
2. Copy the `.env.example` file and rename it to `.env`.
3. Open the `.env` file and set the following variables:
   ```env
   # If using Docker with the default docker-compose.yml configuration:
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/omniqueue"
   
   # Enable Database usage instead of the in-memory fallback:
   USE_DATABASE="true"
   
   # Redis configuration (if Redis is used):
   REDIS_URL="redis://localhost:6379"
   QUEUE_STORE="redis" # Or "auto"
   ```

---

## 3. Installation

Follow these steps to download the source code and install the necessary dependencies.

### Step 1: Clone the Source Code
```bash
git clone <repository_url>
cd omni-queue-360/source-code-main
```

### Step 2: Setup Environment and Dependencies
The system utilizes npm workspaces to manage its packages. You only need to run a single command at the root directory:
```bash
npm run setup
```
**This command automatically:**
1. Installs all Node.js packages (`node_modules`) for both the frontend and backend.
2. Builds the shared packages (e.g., `shared-ui`).
3. Creates a Python virtual environment and installs the required dependencies for the AI Engine (Flask, scikit-learn, etc.).

*(Note: If you need to set up Python manually, you can navigate to `apps/ai-engine`, run `python -m venv venv`, activate the virtual environment using `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (Mac/Linux), and run `pip install -r requirements.txt`)*

---

## 4. Running the System

### Running Database Migrations
The Omni-Queue 360 system is designed to automate schema updates.
- **There is no need to run manual SQL migration commands**.
- When the Backend (API Server) boots up, it will automatically verify and apply any pending migration scripts (updating tables, columns) to the PostgreSQL database.

### Launching the Complete System (Optimal State)
To run all services (API, AI Engine, Kiosk, Admin Portal, Online Portal) concurrently, use the following command at the root directory:

```bash
npm start
```
*(On Windows environments, you can also run the `start.bat` file to ensure the ports are freed before booting).*

### Accessing the Services
Once the system starts successfully, you can access the services via your web browser:

| Service | URL | Function |
|---|---|---|
| **Kiosk** | `http://localhost:3100` | On-site ticket terminal |
| **Admin Dashboard** | `http://localhost:3101` | Management console for Admins & Staff |
| **Online Portal** | `http://localhost:3103` | Remote booking and QR code tracking |
| **API Server** | `http://localhost:5100` | REST API + Socket.IO Server |
| **AI Engine** | `http://localhost:5001` | Wait-time estimation service |

---
**Default Login Credentials (Development):**
- **Administrator**: `admin` / `admin123`
- **Staff**: `staff1` / `staff1` (or `staff2` through `staff6`)
