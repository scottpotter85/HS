# Enterprise Dashboard Application

A modern, responsive enterprise dashboard application built with HTML, JavaScript, and Bootstrap. This application provides a comprehensive interface for managing various business operations including calculations, production orders, logistics, and administrative tasks.

## Features

- 🔐 Secure user authentication and role-based access control
- 📊 Real-time dashboard with key performance indicators
- 🎯 Module-based architecture for different business functions
- 🔍 Global search functionality
- 📱 Responsive design for all device sizes
- 🛠 Administrative interface for user management
- 📨 Integrated support ticket system
- 🔔 Real-time notifications
- 🎨 Modern UI with SAP Fiori-like design elements

## Prerequisites

- Node.js (v14 or higher)
- Modern web browser (Chrome, Firefox, Edge recommended)
- Network file system access (for enterprise deployment)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/[your-username]/enterprise-dashboard.git
   ```

2. Install dependencies:
   ```bash
   cd enterprise-dashboard
   npm install
   ```

3. Create a `.env` file in the root directory with your configuration:
   ```
   PORT=5050
   DB_PATH=./data
   SESSION_SECRET=your-secret-key
   ```

4. Start the server:
   ```bash
   npm start
   ```

5. Access the application at `http://localhost:5050`

## Configuration

The application can be configured through environment variables:

- `PORT`: Server port (default: 5050)
- `DB_PATH`: Path to database files
- `SESSION_SECRET`: Secret for session management
- `API_BASE_URL`: Base URL for API endpoints

## Development

To start the application in development mode with hot reloading:

```bash
npm run dev
```

## Deployment

For production deployment:

1. Build the application:
   ```bash
   npm run build
   ```

2. Start in production mode:
   ```bash
   npm run start:prod
   ```

## Security Considerations

- Always use HTTPS in production
- Regularly update dependencies
- Configure proper CORS settings
- Use secure session management
- Implement rate limiting
- Set up proper authentication and authorization

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Bootstrap for the UI framework
- Material Icons for the icon set
- Node.js community for the server environment 