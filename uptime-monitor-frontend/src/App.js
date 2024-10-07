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

// Register chart components
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

  // Function to fetch all monitors from the backend
  const fetchMonitors = () => {
    fetch('http://localhost:8080/monitors', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
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

  // fetch monitors when the component mounts and then every 5 seconds
  useEffect(() => {
    fetchMonitors(); // Initial fetch
    const intervalId = setInterval(() => {
      fetchMonitors();
    }, 5000);
    return () => clearInterval(intervalId); 
  }, []);

  // func to add a new URL to the database
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

  // func to fetch history for a monitor
  const fetchHistory = (id) => {
    fetch(`http://localhost:8080/monitors/${id}/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch monitor history');
        }
        return response.json();
      })
      .then((data) => {
        setHistory(Array.isArray(data) ? data : []); // Ensure data is an array
        setSelectedMonitor(id); // Set the selected monitor for displaying history
      })
      .catch((error) => {
        console.error('Error fetching monitor history:', error);
      });
  };

  // func to delete a monitor by its ID
  const deleteMonitor = (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this monitor?");
    if (!confirmDelete) {
      return;
    }

    fetch(`http://localhost:8080/monitors/${id}`, {
      method: 'DELETE',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to delete monitor');
        }
        setServices((prevServices) => prevServices.filter((service) => service.id !== id)); // Remove from UI
      })
      .catch((error) => {
        console.error('Error deleting monitor:', error);
      });
  };

  // func to prepare data for the chart
  const prepareChartData = () => {
    if (!history || history.length === 0) return;

    return {
      labels: history.map((entry) => new Date(entry.checked_at).toLocaleTimeString()), // X-axis labels
      datasets: [
        {
          label: 'Monitor Status Over Time',
          data: history.map((entry) => (entry.status === 'UP' ? 1 : 0)), // Y-axis values (UP=1, DOWN=0)
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
              <p>Status: {service.status}</p>
              <p>SSL Expiry: {service.ssl_expiry}</p>
              <p>Last Checked: {new Date(service.last_checked).toLocaleString()}</p>
              <button onClick={() => deleteMonitor(service.id)}>Delete</button> {/* Delete button */}
              <button onClick={() => fetchHistory(service.id)}>View History</button> {/* View history button */}
            </div>
          ))}
        </div>

        {selectedMonitor && history && history.length > 0 && (
          <div className="monitor-history">
            <h3>Monitor History</h3>
            <Line data={prepareChartData()} /> {/* Line chart to display history */}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;