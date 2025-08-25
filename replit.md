# Overview

ProxyGrid is a full-stack web application that enables users to view multiple instances of websites simultaneously through different proxy servers. The application allows users to select a target URL, choose a geographic location (USA, Canada, Australia), set refresh intervals, and display the content across 10 screen grids. Each screen loads the same URL through randomly assigned proxy servers from the selected country, with automatic proxy rotation and validation.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client-side is built as a React-based Single Page Application (SPA) using:
- **React 18** with TypeScript for component-based UI development
- **Vite** as the build tool and development server for fast compilation and hot module replacement
- **Tailwind CSS** with custom design tokens for styling and responsive design
- **shadcn/ui** component library providing pre-built, accessible UI components using Radix UI primitives
- **TanStack Query** (React Query) for server state management, caching, and data synchronization
- **Wouter** as a lightweight client-side routing solution
- **Axios** for HTTP client requests to the backend API

The frontend follows a component-driven architecture with clear separation between UI components (`/components/ui/`) and feature components (`/components/`). State management is handled through React hooks and TanStack Query for server state.

## Backend Architecture
The server is built using Node.js with Express.js following a RESTful API pattern:
- **Express.js** server with TypeScript for type safety and better development experience
- **In-memory storage** using Map-based data structures for user sessions, proxy data, and screen configurations
- **Proxy service layer** that handles proxy scraping, validation, and rotation
- **HTTP proxy middleware** for routing requests through different proxy servers
- **Background job system** for automatic proxy updates every 5 minutes

The backend implements a service-oriented architecture with clear separation of concerns:
- Route handlers in `/server/routes.ts` for API endpoints
- Storage abstraction layer in `/server/storage.ts` for data persistence
- Proxy management service in `/server/services/` for proxy operations

## Database Schema
The application uses Drizzle ORM with PostgreSQL for data persistence, defining three main entities:
- **Users table** - Basic user authentication with username/password
- **Proxies table** - Proxy server information including IP, port, country, working status, and performance metrics
- **Screen Sessions table** - Configuration for each screen instance including target URL, proxy assignment, refresh intervals, and activity status

The schema supports proxy health monitoring with response time tracking and automatic validation status updates.

## Proxy Management System
The core functionality revolves around dynamic proxy management:
- **Proxy scraping** from multiple sources (proxyscrape.com, free-proxy-list.net)
- **Automatic proxy validation** by testing connectivity and response times
- **Geographic proxy assignment** based on user-selected countries
- **Proxy rotation** to distribute load and avoid rate limiting
- **Health monitoring** with automatic removal of non-working proxies

## API Design
RESTful API endpoints provide:
- `/api/proxy-stats` - Real-time proxy statistics and health metrics
- `/api/screen-sessions` - CRUD operations for managing screen configurations
- `/api/proxies` - Proxy management and status information

The API follows standard HTTP methods and status codes with consistent JSON response formats.

# External Dependencies

## Core Framework Dependencies
- **React ecosystem**: React 18, React DOM, React Hook Form with Zod validation
- **Build tools**: Vite with TypeScript support, ESBuild for production builds
- **Styling**: Tailwind CSS with PostCSS, class-variance-authority for component variants
- **UI Components**: Radix UI primitives, Lucide React icons, shadcn/ui component library

## Backend Dependencies
- **Server framework**: Express.js with TypeScript support
- **Database**: PostgreSQL with Neon serverless driver, Drizzle ORM for schema management
- **Proxy handling**: http-proxy-middleware, axios for HTTP requests
- **Session management**: connect-pg-simple for PostgreSQL session storage

## Development Dependencies
- **TypeScript**: Full type checking across frontend and backend
- **Development tools**: tsx for TypeScript execution, Vite plugins for development experience
- **Code quality**: ESLint configuration, Prettier for code formatting

## Third-party Services
- **Proxy sources**: Free proxy APIs including proxyscrape.com and proxy-list.download
- **Database hosting**: Neon serverless PostgreSQL for scalable database management
- **Session storage**: PostgreSQL-backed session management for user state persistence

The application is designed to work with Replit's development environment, including specific Vite plugins for the Replit ecosystem and development banner integration.