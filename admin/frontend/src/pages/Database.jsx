import React, { useState } from 'react';
import { Database as DatabaseIcon, Play, Download } from 'lucide-react';
import { database } from '../services/api';

export default function Database() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const executeQuery = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response = await database.executeQuery(query, 100);
      setResults(response.data);
    } catch (error) {
      console.error('Query failed:', error);
      setResults({
        error: error.response?.data?.detail || 'Query execution failed',
        status: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Query Editor */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center">
          <DatabaseIcon className="w-5 h-5 mr-2" />
          SQL Query Editor
        </h2>
        <div className="space-y-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your SQL query here..."
            className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:text-white font-mono text-sm"
          />
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              ⚠️ Be careful with DELETE and UPDATE queries
            </p>
            <div className="space-x-2">
              <button
                onClick={executeQuery}
                disabled={!query || loading}
                className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="w-4 h-4 mr-2" />
                {loading ? 'Executing...' : 'Execute'}
              </button>
              <button className="inline-flex items-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700">
                <Download className="w-4 h-4 mr-2" />
                Backup
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Results</h3>
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-4">
            <pre className="text-sm text-gray-900 dark:text-white">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Database Info */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Database Tables</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['users', 'uploaded_files', 'print_queue', 'printer_stations', 'user_settings', 'admin_logs'].map(table => (
            <button
              key={table}
              onClick={() => {
                setQuery(`SELECT * FROM ${table} LIMIT 100;`);
                executeQuery();
              }}
              className="p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-left"
            >
              <p className="font-medium text-gray-900 dark:text-white">{table}</p>
              <p className="text-sm text-blue-600 dark:text-blue-400 hover:underline">View →</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}