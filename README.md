# ExpenseTrack - Student Finance App

A clean, modern, and friendly Student Expense Tracker web application designed to make personal budgeting approachable and encouraging for college students.

Exported from Google Stitch and built into a fully functional Single Page Application (SPA).

## 🚀 Features

- **Multi-Screen Dashboard**:
  - **Dashboard**: Live monthly spending velocity, remaining safe allowance, category budget snapshots, and recent transaction history.
  - **Budget Setup**: Fine-tune category budgets with live spending gauges, macro capacity monitoring, and budget alerts.
  - **Analytics**: Chart.js-powered Category Distribution Donut Chart and Term Spending Velocity Bar Chart with detailed breakdown lists.
  - **Settings & Profile**: Student profile summary, data management, and controls to test empty states or restore demo data.
- **Expense CRUD**:
  - Log expenses in under 10 seconds via the Quick Log modal or mobile floating action button (FAB).
  - Edit or delete any transaction directly from the recent activity list.
  - Form validation requiring positive amounts, valid dates, and categorized entries.
- **6 Student-Centric Categories**:
  - 🍽️ Food & Dining
  - 🛍️ Groceries
  - 📚 Textbooks & Coursework
  - 🎉 Entertainment & Social
  - 📱 Personal & Subscriptions
  - 🔒 Emergency Student Fund (Auto-Save Cushion)
- **Local Persistence**: All transactions, category allocations, and settings are saved locally in browser `localStorage`.
- **Responsive Design**: Mobile-first fluid layout with desktop sidebar and mobile bottom navigation.

## 🛠️ Stack

- **HTML5 & Vanilla JavaScript (ES6+)**
- **Tailwind CSS** (via CDN)
- **Chart.js** (via CDN)
- **Google Fonts** (Plus Jakarta Sans & Inter)
- **Material Symbols Outlined**

## 🌐 Deployment (GitHub Pages)

This project is a static web application and can be served directly via GitHub Pages:

1. Push this repository to GitHub.
2. Navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder, then click **Save**.
