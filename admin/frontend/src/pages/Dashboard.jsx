import React, { useEffect, useState } from 'react';
import { dashboard } from '../services/api';
import {
  Users,
  FileText,
  Printer,
  HardDrive,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [statsRes, activityRes, healthRes] = await Promise.all([
        dashboard.getStats(),
        dashboard.getActivity(10),
        dashboard.getHealth()
      ]);

      setStats(statsRes.data);
      setActivity(activityRes.data);
      setHealth(healthRes.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={stats?.overview?.total_users || 0}
          subtitle={`${stats?.overview?.active_users || 0} active`}
          icon={Users}
          color="bg-blue-500"
        />
        <StatCard
          title="Total Files"
          value={stats?.overview?.total_files || 0}
          subtitle={`${stats?.overview?.total_storage_mb || 0} MB`}
          icon={FileText}
          color="bg-green-500"
        />
        <StatCard
          title="Print Jobs"
          value={stats?.overview?.total_print_jobs || 0}
          subtitle={`${stats?.print_queue?.pending || 0} pending`}
          icon={Printer}
          color="bg-purple-500"
        />
        <StatCard
          title="Printer Stations"
          value={stats?.stations?.total || 0}
          subtitle={`${stats?.stations?.online || 0} online`}
          icon={Activity}
          color="bg-orange-500"
        />
      </div>

      {/* Today's Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Today's Activity</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats?.today?.uploads || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Uploads</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats?.today?.prints || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Prints</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats?.today?.registrations || 0}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">New Users</p>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">System Health</h2>
        <div className="space-y-3">
          <HealthIndicator
            label="Database"
            status={health?.database || 'unknown'}
          />
          <HealthIndicator
            label="Storage"
            status={health?.storage || 'unknown'}
          />
          <HealthIndicator
            label="Print Queue"
            status={health?.services?.print_queue?.status || 'unknown'}
            detail={`${health?.services?.print_queue?.failed_count || 0} failed jobs`}
          />
          <HealthIndicator
            label="Printer Stations"
            status={health?.services?.printer_stations?.status || 'unknown'}
            detail={`${health?.services?.printer_stations?.stale_count || 0} stale stations`}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Recent Activity</h2>
        <div className="space-y-3">
          {activity.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No recent activity</p>
          ) : (
            activity.map((item, index) => (
              <ActivityItem key={index} activity={item} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <div className="flex items-center">
        <div className={`rounded-full p-3 ${color} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
        </div>
        <div className="ml-4 flex-1">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function HealthIndicator({ label, status, detail }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'critical':
      case 'unhealthy':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'healthy':
        return 'Operational';
      case 'warning':
        return 'Warning';
      case 'critical':
      case 'unhealthy':
        return 'Critical';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
      <div className="flex items-center">
        {getStatusIcon()}
        <span className="ml-3 font-medium text-gray-900 dark:text-white">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-sm text-gray-600 dark:text-gray-300">{getStatusText()}</span>
        {detail && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{detail}</p>
        )}
      </div>
    </div>
  );
}

function ActivityItem({ activity }) {
  const getActivityIcon = () => {
    switch (activity.type) {
      case 'upload':
        return <FileText className="w-4 h-4" />;
      case 'print':
        return <Printer className="w-4 h-4" />;
      case 'registration':
        return <Users className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityText = () => {
    switch (activity.type) {
      case 'upload':
        return `${activity.username} uploaded ${activity.details.filename}`;
      case 'print':
        return `${activity.username} printed ${activity.details.filename}`;
      case 'registration':
        return `New user registered: ${activity.username}`;
      default:
        return `${activity.username} performed ${activity.type}`;
    }
  };

  return (
    <div className="flex items-center space-x-3 text-sm">
      <div className="flex-shrink-0 text-gray-400">
        {getActivityIcon()}
      </div>
      <div className="flex-1 text-gray-900 dark:text-white">
        {getActivityText()}
      </div>
      <div className="text-gray-500 dark:text-gray-400 text-xs">
        {new Date(activity.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}