import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu, FileVideo, LogOut, User, Settings, Bell, Megaphone, Radio, Users, ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import Logo from '/logo.png';

interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon: string;
  visible: boolean;
  order: number;
  category: 'streaming' | 'content' | 'analytics' | 'system';
}

const DashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const { user, logout, getToken } = useAuth();
  const location = useLocation();

  // Menu items padrão
  const defaultMenuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'Home', visible: true, order: 0, category: 'system' },
    { id: 'iniciar-transmissao', label: 'Iniciar Transmissão', path: '/dashboard/iniciar-transmissao', icon: 'Radio', visible: true, order: 1, category: 'streaming' },
    { id: 'dados-conexao', label: 'Dados de Conexão', path: '/dashboard/dados-conexao', icon: 'Wifi', visible: true, order: 2, category: 'streaming' },
    { id: 'players', label: 'Players', path: '/dashboard/players', icon: 'PlayCircle', visible: true, order: 3, category: 'streaming' },
    { id: 'gerenciarvideos', label: 'Gerenciar Vídeos', path: '/dashboard/gerenciarvideos', icon: 'FileVideo', visible: true, order: 4, category: 'content' },
    { id: 'playlists', label: 'Playlists', path: '/dashboard/playlists', icon: 'List', visible: true, order: 5, category: 'content' },
    { id: 'agendamentos', label: 'Agendamentos', path: '/dashboard/agendamentos', icon: 'Calendar', visible: true, order: 6, category: 'content' },
    { id: 'comerciais', label: 'Comerciais', path: '/dashboard/comerciais', icon: 'Megaphone', visible: true, order: 7, category: 'content' },
    { id: 'downloadyoutube', label: 'Download YouTube', path: '/dashboard/downloadyoutube', icon: 'Youtube', visible: true, order: 8, category: 'content' },
    { id: 'migrar-videos-ftp', label: 'Migrar FTP', path: '/dashboard/migrar-videos-ftp', icon: 'Server', visible: true, order: 9, category: 'content' },
    { id: 'espectadores', label: 'Espectadores', path: '/dashboard/espectadores', icon: 'Users', visible: true, order: 10, category: 'analytics' },
    { id: 'relayrtmp', label: 'Relay RTMP', path: '/dashboard/relayrtmp', icon: 'ArrowLeftRight', visible: true, order: 11, category: 'streaming' },
    { id: 'conversao-videos', label: 'Conversão de Vídeos', path: '/dashboard/conversao-videos', icon: 'Settings', visible: true, order: 12, category: 'content' },
    { id: 'app-multiplataforma', label: 'App Multiplataforma', path: '/dashboard/app-multiplataforma', icon: 'Smartphone', visible: true, order: 13, category: 'content' },
    { id: 'app-android', label: 'App Android', path: '/dashboard/app-android', icon: 'Smartphone', visible: true, order: 14, category: 'content' },
    { id: 'configuracoes', label: 'Configurações', path: '/dashboard/configuracoes', icon: 'Settings', visible: true, order: 13, category: 'system' },
  ];

  useEffect(() => {
    loadUserSettings();
  }, []);

  const loadUserSettings = async () => {
    try {
      const token = await getToken();
      if (!token) {
        console.warn('Token não encontrado, usando configurações padrão');
        setMenuItems(defaultMenuItems);
        return;
      }
      
      const response = await fetch('/api/user-settings', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.menu_items) {
          setMenuItems(data.menu_items.sort((a: MenuItem, b: MenuItem) => a.order - b.order));
        } else {
          setMenuItems(defaultMenuItems);
        }
      } else {
        console.warn('Erro ao carregar configurações do usuário, usando padrão');
        setMenuItems(defaultMenuItems);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      setMenuItems(defaultMenuItems);
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Fecha sidebar ao clicar fora, só no mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarOpen) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.contains(event.target as Node)) {
          setSidebarOpen(false);
        }
      }
    };
    if (sidebarOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [sidebarOpen]);

  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: React.ComponentType<any> } = {
      Home: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h2a1 1 0 001-1v-7m-6 0a1 1 0 01-1-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1z" />
        </svg>
      ),
      Radio: Radio,
      Wifi: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      PlayCircle: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      FileVideo: FileVideo,
      List: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
      Calendar: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      Megaphone: Megaphone,
      Youtube: () => (
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      Server: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
      Users: Users,
      ArrowLeftRight: ArrowLeftRight,
      Settings: Settings,
      Smartphone: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    };
    return icons[iconName] || Settings;
  };

  // Filtrar apenas itens visíveis e ordenar
  const visibleMenuItems = menuItems
    .filter(item => item.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex h-screen bg-gray-100">
      <aside
        id="sidebar"
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-md transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:h-auto`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center px-10 py-6 border-b border-gray-200">
            <img src={Logo} alt="Logo" className="h-20 w-auto mr-2" />
          </div>

          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            <ul className="space-y-2">
              {visibleMenuItems.map((item) => {
                const IconComponent = getIconComponent(item.icon);
                return (
                  <li key={item.id}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center px-4 py-3 text-gray-700 rounded-lg ${
                          isActive ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-100'
                        }`
                      }
                      end={item.path === '/dashboard'}
                    >
                      <span className="mr-3">
                        <IconComponent />
                      </span>
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="px-4 py-6 border-t border-gray-200">
            <button
              onClick={logout}
              className="flex items-center w-full px-4 py-3 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              <LogOut className="h-5 w-5 mr-3" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm z-10">
          <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <button
              className="p-1 rounded-md lg:hidden focus:outline-none focus:ring-2 focus:ring-primary-500"
              onClick={toggleSidebar}
            >
              <Menu className="h-6 w-6 text-gray-600" />
            </button>
            <div className="flex items-center">
              <button className="p-1 rounded-full text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 mr-3">
                <Bell className="h-6 w-6" />
              </button>
              <div className="relative flex items-center">
                <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center text-white">
                  <User className="h-5 w-5" />
                </div>
                <div className="ml-2">
                  <span className="font-medium text-gray-700">{user?.nome || 'Usuário'}</span>
                  {user?.tipo && (
                    <span className={`ml-2 text-xs px-2 py-1 rounded-full ${
                      user.tipo === 'revenda' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {user.tipo === 'revenda' ? 'Revenda' : 'Streaming'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-full overflow-x-hidden"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;