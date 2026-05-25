import React, { useMemo } from 'react';
import { ShortLink } from '../types';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { TrendingUp, Link, MousePointerClick, Calendar } from 'lucide-react';

interface DashboardProps {
  links: ShortLink[];
}

export const Dashboard: React.FC<DashboardProps> = ({ links }) => {
  
  const stats = useMemo(() => {
    const totalLinks = links.length;
    const totalClicks = links.reduce((acc, link) => acc + link.totalClicks, 0);
    const topPerformer = links.length > 0 
      ? [...links].sort((a, b) => b.totalClicks - a.totalClicks)[0] 
      : null;
    
    // Aggregate clicks by date for the chart
    const clicksByDateMap = new Map<string, number>();
    links.forEach(link => {
      link.clickHistory.forEach(h => {
        const current = clicksByDateMap.get(h.date) || 0;
        clicksByDateMap.set(h.date, current + h.count);
      });
    });

    // Convert map to array and sort by date
    const chartData = Array.from(clicksByDateMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { totalLinks, totalClicks, topPerformer, chartData };
  }, [links]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Total Clicks */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-brand-primary/10 rounded-xl">
            <MousePointerClick className="w-8 h-8 text-brand-primary" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Clicks</p>
            <h3 className="text-2xl font-bold text-brand-navy">{stats.totalClicks.toLocaleString()}</h3>
          </div>
        </div>

        {/* Card 2: Total Links */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-brand-green/10 rounded-xl">
            <Link className="w-8 h-8 text-brand-green" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Active Links</p>
            <h3 className="text-2xl font-bold text-brand-navy">{stats.totalLinks}</h3>
          </div>
        </div>

        {/* Card 3: Top Performer */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-brand-yellow/10 rounded-xl">
            <TrendingUp className="w-8 h-8 text-brand-yellow" />
          </div>
          <div className="overflow-hidden">
            <p className="text-sm text-gray-500 font-medium">Top Performer</p>
            <h3 className="text-lg font-bold text-brand-navy truncate">
              {stats.topPerformer ? stats.topPerformer.alias : 'N/A'}
            </h3>
            <p className="text-xs text-gray-400 truncate">
              {stats.topPerformer ? `${stats.topPerformer.totalClicks} clicks` : 'No data yet'}
            </p>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Traffic Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-brand-navy">Click Traffic Over Time</h3>
            <div className="flex items-center text-sm text-gray-500">
              <Calendar className="w-4 h-4 mr-1 text-brand-primary" />
              <span>Last 30 Days</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData}>
                <defs>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3db5e6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3db5e6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tick={{fontSize: 12, fill: '#9ca3af'}} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                />
                <YAxis 
                  tick={{fontSize: 12, fill: '#9ca3af'}} 
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', fontFamily: 'sans-serif'}}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#3db5e6" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorClicks)" 
                />
              </AreaChart>
            </ResponsiveContainer>
            {stats.chartData.length === 0 && (
               <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm bg-white/50">
                 No click data available to display chart.
               </div>
             )}
          </div>
        </div>

        {/* Mini Stats / Breakdown */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
           <h3 className="text-lg font-bold text-brand-navy mb-6">Performance</h3>
           <div className="flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                 <BarChart 
                   layout="vertical" 
                   data={links.sort((a,b) => b.totalClicks - a.totalClicks).slice(0, 5)}
                 >
                   <XAxis type="number" hide />
                   <YAxis 
                     dataKey="alias" 
                     type="category" 
                     tick={{fontSize: 11, fill: '#13284c', fontWeight: 'bold'}} 
                     width={80}
                   />
                   <Tooltip cursor={{fill: 'transparent'}} />
                   <Bar dataKey="totalClicks" fill="#3db5e6" radius={[0, 4, 4, 0]} barSize={20} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
           <div className="mt-4 text-center text-xs text-gray-400">
             Top 5 performing links by total clicks
           </div>
        </div>
      </div>
    </div>
  );
};