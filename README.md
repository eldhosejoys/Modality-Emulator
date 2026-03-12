# 🏥 DICOM Modality Emulator

A modern, web-based DICOM Modality Emulator designed for testing radiology workflows, RIS/PACS connectivity, and DICOM tag binding. Built with **React 19**, **Node.js**, and **dcmjs-dimse**.

![Version: 1.0.0](https://img.shields.io/badge/Version-1.0.0-green.svg)

## ✨ Features

- **📡 DICOM Connectivity Testing**: Perform C-ECHO (Ping) to verify connections with RIS and PACS nodes.
- **🔍 Modality Worklist (MWL)**: Query RIS servers using C-FIND with customizable query parameters.
- **🗳️ Image Storage (C-STORE)**: Send DICOM images to PACS servers.
- **🔗 Automatic Tag Binding**: Sync patient and study information from Worklist results directly into your DICOM files before transmission.
- **✏️ Manual Tag Overrides**: Fine-tune specific DICOM tags (e.g., Patient Name, ID, Accession Number) on the fly.
- **⚙️ Multi-Node Configuration**: Easily switch between different RIS, PACS, and local emulator settings.
- **🖥️ Built-in SCP**: Includes a local Verification SCP (C-ECHO) for testing inbound connectivity.
- **📜 Activity Logging**: Real-time console and UI logs for tracking all DICOM transactions.

## 🚀 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS 4, Lucide Icons, Framer Motion.
- **Backend**: Node.js, Express, Multer.
- **DICOM**: [dcmjs-dimse](https://github.com/v8tix/dcmjs-dimse) for DIMSE services and [dcmjs](https://github.com/dcmjs-org/dcmjs) for tag manipulation.

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/eldhosejoys/Modality-Emulator.git
   cd Modality-Emulator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   This command starts both the Vite frontend and the Node.js backend concurrently.
   ```bash
   npm run dev
   ```

4. **Open the App**:
   Navigate to `http://localhost:5173` in your browser.

## 📂 Project Structure

```text
Modality-Emulator/
├── src/                # React Frontend
│   ├── components/     # UI Tabs and Modals
│   ├── api.ts          # Axios client and API wrappers
│   └── App.tsx         # Main application shell
├── server/             # Node.js Backend
│   ├── routes/         # API Endpoints (DICOM, Settings, etc.)
│   ├── data/           # Storage for DICOM files and settings
│   └── index.js        # Server entry point
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

## 📖 Usage Guide

1. **Configuration**: Go to the **Settings** modal to configure your Local AE Title, RIS AE Title/IP, and PACS AE Title/IP.
2. **Worklist**: Navigate to the **Worklist** tab, enter your criteria, and click **Query**. Select a result to "Bind" those tags for the next store operation.
3. **Storage**: In the **Store Images** tab, upload or select files from the local storage. If a worklist item is selected, the tags will be automatically updated in the files before they are sent to PACS.
4. **Logs**: Check the **Activity Log** at the bottom to see detailed DIMSE status codes and error messages.
