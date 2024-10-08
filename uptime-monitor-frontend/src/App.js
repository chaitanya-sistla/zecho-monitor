import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [url, setUrl] = useState('');
  const [services, setServices] = useState([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [selectedMonitor, setSelectedMonitor] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || ''); // Store JWT token
  const [isRegistering, setIsRegistering] = useState(false); // Handle registration vs login mode
  const [successMessage, setSuccessMessage] = useState(''); // Store success messages like registration success

  // Validation error messages
  const [formError, setFormError] = useState('');

// Function to validate registration form
const validateRegistration = (username, password) => {
  if (!username || !password) {
    setFormError("Username and password are required.");
    return false;
  }
  if (password.length < 7) {
    setFormError("Password must be at least 7 characters long.");
    return false;
  }
  setFormError(''); // Clear error if validation passes
  return true;
};

// Function to register a new user
const register = async (username, password) => {
  if (!validateRegistration(username, password)) {
    return; // Stop registration if validation fails
  }

  try {
    const response = await fetch('http://localhost:8080/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const data = await response.json(); // Parse as JSON on success
      setSuccessMessage("Registration successful");
      console.log("Registration successful:", data);
    } else {
      const contentType = response.headers.get('content-type');
      let errorMessage;

      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json();
        errorMessage = errorData.error || 'Registration failed';
      } else {
        errorMessage = await response.text();
      }

      console.error("Registration failed:", errorMessage);
      setError(errorMessage);
    }
  } catch (error) {
    console.error("Error during registration:", error);
    setError("An unexpected error occurred");
  }
};


  // Function to login and get JWT token
  const login = async (username, password) => {
    if (!username || !password) {
      setFormError("Username and password are required.");
      return;
    }

    const response = await fetch('http://localhost:8080/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (response.ok && data.token) {
      localStorage.setItem('token', data.token); // Store token in localStorage
      setToken(data.token);
      setFormError(''); // Clear form errors on successful login
    } else {
      console.error('Login failed:', data.message);
      setError('Login failed');
    }
  };

  // Fetch monitors
  const fetchMonitors = () => {
    fetch('http://localhost:8080/monitors', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // Pass JWT token in the Authorization header
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch monitors');
        }
        return response.json();
      })
      .then((data) => {
        setServices(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error('Error fetching monitors:', error);
        setError('Failed to fetch monitors');
      });
  };

  // Fetch monitors when the component mounts and then every 5 seconds
  useEffect(() => {
    if (token) {
      fetchMonitors();
      const intervalId = setInterval(() => {
        fetchMonitors();
      }, 5000);
      return () => clearInterval(intervalId);
    }
  }, [token]);

  // Add a new monitor
  const addUrl = () => {
    if (!url) {
      setError('Please enter a valid URL');
      return;
    }

    const newService = {
      url,
      status: 'Checking...',
      ssl_expiry: '',
      last_checked: new Date(),
    };

    fetch('http://localhost:8080/monitors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // Pass JWT token
      },
      body: JSON.stringify(newService),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to add monitor');
        }
        return response.json();
      })
      .then(() => {
        setUrl(''); // Clear the input field
        setError(''); // Clear previous errors
        fetchMonitors(); // Refresh the list after adding a new monitor
      })
      .catch((error) => {
        setError('Failed to add monitor');
        console.error(error);
      });
  };

  // Fetch history for a monitor
  const fetchHistory = (id) => {
    fetch(`http://localhost:8080/monitors/${id}/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, // Pass JWT token
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch monitor history');
        }
        return response.json();
      })
      .then((data) => {
        setHistory(Array.isArray(data) ? data : []);
        setSelectedMonitor(id);
      })
      .catch((error) => {
        console.error('Error fetching monitor history:', error);
      });
  };

  // Delete a monitor
  const deleteMonitor = (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this monitor?');
    if (!confirmDelete) {
      return;
    }

    fetch(`http://localhost:8080/monitors/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`, // Pass JWT token
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to delete monitor');
        }
        setServices((prevServices) => prevServices.filter((service) => service.id !== id));
      })
      .catch((error) => {
        console.error('Error deleting monitor:', error);
      });
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (!history || history.length === 0) return;

    return {
      labels: history.map((entry) => new Date(entry.checked_at).toLocaleTimeString()),
      datasets: [
        {
          label: 'Monitor Status Over Time',
          data: history.map((entry) => (entry.status === 'UP' ? 1 : 0)),
          fill: false,
          borderColor: 'blue',
        },
      ],
    };
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Uptime Monitor</h1>
      </header>
      <div className="App-content">
        {!token && (
          <div>
            {isRegistering ? (
              <>
                <h2>Register</h2>
                <input type="text" placeholder="Username" id="register-username" />
                <input type="password" placeholder="Password" id="register-password" />
                <button
                  onClick={() =>
                    register(
                      document.getElementById('register-username').value,
                      document.getElementById('register-password').value
                    )
                  }
                >
                  Register
                </button>
                <button onClick={() => setIsRegistering(false)}>Go to Login</button>
              </>
            ) : (
              <>
                <h2>Login</h2>
                <input type="text" placeholder="Username" id="login-username" />
                <input type="password" placeholder="Password" id="login-password" />
                <button
                  onClick={() =>
                    login(
                      document.getElementById('login-username').value,
                      document.getElementById('login-password').value
                    )
                  }
                >
                  Login
                </button>
                <button onClick={() => setIsRegistering(true)}>Go to Register</button>
              </>
            )}
            {formError && <p className="error-message">{formError}</p>}
            {error && <p className="error-message">{error}</p>}
            {successMessage && <p className="success-message">{successMessage}</p>}
          </div>
        )}
        {token && (
          <>
            <input
              type="text"
              placeholder="Enter URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button onClick={addUrl}>Add URL</button>

            {error && <p style={{ color: 'red' }}>{error}</p>}

            <div className="service-statuses">
              {services.length === 0 && <p>No URLs added yet.</p>}
              {services.map((service, index) => (
                <div key={index} className="service">
                  <h2>{service.url}</h2>
                  <p>Status: 
                    <span className={`status-indicator ${service.status === 'UP' ? 'up' : 'down'}`}></span> {/* Status indicator */}
                    {service.status}
                  </p>
                  <p>SSL Expiry: {service.ssl_expiry}</p>
                  <p>Last Checked: {new Date(service.last_checked).toLocaleString()}</p>
                  <button onClick={() => deleteMonitor(service.id)}>Delete</button>
                  <button onClick={() => fetchHistory(service.id)}>View History</button>
                </div>
              ))}
            </div>


            {selectedMonitor && history && history.length > 0 && (
              <div className="monitor-history">
                <h3>Monitor History</h3>
                <Line data={prepareChartData()} />
              </div>
            )}
            <button className="logout-button" onClick={() => { localStorage.removeItem('token'); setToken(''); }}>
              Logout
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
