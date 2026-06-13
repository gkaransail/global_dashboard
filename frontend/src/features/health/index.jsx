import React from 'react';
import { useStore } from '../../core/store';
import { api } from '../../core/api';

const HealthFeature = () => {
  const { ticker, timeframe } = useStore();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await api.get('/api/v1/health');
        setData(response.data);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [ticker, timeframe]);

  if (loading) return <div className="spinner-wrap"><div className="spinner" /></div>;
  if (error) return <div className="pad"><div className="error-box">⚠ {error}</div></div>;
  if (!data) return null;

  return (
    <div>
      <h2>Health Check</h2>
      <p>Status: {data.status}</p>
      <p>Timestamp: {data.timestamp}</p>
    </div>
  );
};

export default HealthFeature;