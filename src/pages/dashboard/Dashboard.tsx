import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStream } from '../../context/StreamContext';
import AdvancedVideoPlayer from '../../components/AdvancedVideoPlayer';
import {
  Settings, Users, BarChart, FileVideo,
  PlayCircle, Play, Smartphone, RefreshCw, Radio, Square,
  FolderPlus, Calendar, Youtube, Wifi, ArrowLeftRight,
  Megaphone, Activity, Clock, Eye, Zap, Server, AlertCircle, HardDrive
} from 'lucide-react';

interface OBSStreamStatus {
  is_live: boolean;
  is_active: boolean;
  viewers: number;
  bitrate: number;
  uptime: string;
  recording: boolean;
  platforms: any[];
}

interface Playlist {
  id: number;
  nome: string;
}

interface PlaylistVideo {
  id: number;
  ordem: number;
  videos: {
    id: number;
    nome: string;
    url: string;
    duracao?: number;
  };
}

const Dashboard: React.FC = () => {
  const { user, getToken } = useAuth();
  const { streamData } = useStream();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [obsStatus, setObsStatus] = useState<OBSStreamStatus | null>(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [playlistVideos, setPlaylistVideos] = useState<PlaylistVideo[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlayingPlaylist, setIsPlayingPlaylist] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [obsStreamActive, setObsStreamActive] = useState(false);
  const [obsStreamUrl, setObsStreamUrl] = useState<string>('');

  // Função para abrir vídeo em nova aba
  const openVideoInNewTab = (video: PlaylistVideo) => {
    const isProduction = window.location.hostname !== 'localhost';
    const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
    const wowzaUser = 'admin';
    const wowzaPassword = 'FK38Ca2SuE6jvJXed97VMn';

    if (video.videos.url) {
      let externalUrl;

      // Para vídeos SSH, construir URL direta
      if (video.videos.url.includes('/api/videos-ssh/')) {
        try {
          const videoId = video.videos.url.split('/stream/')[1]?.split('?')[0];
          if (videoId) {
            const remotePath = Buffer.from(videoId, 'base64').toString('utf-8');
            const relativePath = remotePath.replace('/usr/local/WowzaStreamingEngine/content', '');
            externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content${relativePath}`;
          } else {
            externalUrl = video.videos.url;
          }
        } catch (error) {
          externalUrl = video.videos.url;
        }
      } else if (video.videos.url.startsWith('/content')) {
        externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980${video.videos.url}`;
      } else if (!video.videos.url.startsWith('http')) {
        externalUrl = `http://${wowzaUser}:${wowzaPassword}@${wowzaHost}:6980/content/${video.videos.url}`;
      } else {
        externalUrl = video.videos.url;
      }

      window.open(externalUrl, '_blank');
    }
  };
  // Estado para dados de armazenamento
  const [storageData, setStorageData] = useState({
    used: 0,
    total: user?.espaco || 0,
    percentage: 0
  });

  // Carregar dados de armazenamento
  useEffect(() => {
    loadStorageData();
  }, [user]);

  const loadStorageData = async () => {
    try {
      const token = await getToken();
      if (!token || !user) return;

      // Buscar dados de todas as pastas do usuário para calcular espaço usado
      const foldersResponse = await fetch('/api/folders', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (foldersResponse.ok) {
        const folders = await foldersResponse.json();
        let totalUsed = 0;

        // Para cada pasta, buscar o uso via API SSH
        for (const folder of folders) {
          try {
            const usageResponse = await fetch(`/api/videos-ssh/folders/${folder.id}/usage`, {
              headers: { Authorization: `Bearer ${token}` }
            });

            if (usageResponse.ok) {
              const usageData = await usageResponse.json();
              if (usageData.success) {
                totalUsed += usageData.usage.used || 0;
              }
            }
          } catch (error) {
            console.warn(`Erro ao carregar uso da pasta ${folder.id}:`, error);
          }
        }

        const total = user.espaco || 0;
        const percentage = total > 0 ? Math.round((totalUsed / total) * 100) : 0;

        setStorageData({
          used: totalUsed,
          total: total,
          percentage: percentage
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados de armazenamento:', error);
    }
  };

  useEffect(() => {
    loadPlaylists();
    checkOBSStatus();

    // Atualizar status OBS a cada 30 segundos
    const interval = setInterval(checkOBSStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadPlaylists = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/playlists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setPlaylists(data);
    } catch (error) {
      console.error('Erro ao carregar playlists:', error);
    }
  };

  const userLogin = user?.email ? user.email.split('@')[0] : '';

  const checkOBSStatus = async () => {
    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/obs-status', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setObsStatus(data.obs_stream);
          if (data.obs_stream.is_live) {
            setObsStreamActive(true);
            setObsStreamUrl(`http://samhost.wcore.com.br:1935/samhost/${userLogin}_live/playlist.m3u8`);
          } else {
            setObsStreamActive(false);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao verificar status OBS:', error);
    }
  };

  const stopOBSStream = async () => {
    if (!confirm('Deseja realmente finalizar a transmissão OBS?')) return;

    try {
      const token = await getToken();
      const response = await fetch('/api/streaming/obs-stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        // toast.success('Transmissão OBS finalizada com sucesso!');
        checkOBSStatus();
      } else {
        // toast.error(result.error || 'Erro ao finalizar transmissão');
      }
    } catch (error) {
      console.error('Erro ao parar stream OBS:', error);
      // toast.error('Erro ao finalizar transmissão');
    }
  };
  // Função otimizada para vídeos SSH
  const buildOptimizedSSHUrl = (url: string) => {
    if (!url.includes('/api/videos-ssh/stream/')) return url;

    const videoId = url.split('/stream/')[1]?.split('?')[0];
    if (videoId) {
      const token = localStorage.getItem('auth_token');
      return `/api/videos-ssh/proxy-stream/${videoId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    }

    return url;
  };

  const loadPlaylistVideos = async (playlistId: string) => {
    try {
      const token = await getToken();
      const response = await fetch(`/api/playlists/${playlistId}/videos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      // Processar vídeos para usar URLs HLS
      const processedVideos = data.map((item: any) => {
        const video = item.videos;

        // Construir URL HLS correta
        let videoUrl = video.url;

        if (videoUrl && !videoUrl.startsWith('http')) {
          const cleanPath = videoUrl.replace(/^\/+/, '');
          const pathParts = cleanPath.split('/');

          if (pathParts.length >= 3) {
            const userLogin = pathParts[0];
            const folderName = pathParts[1];
            const fileName = pathParts[2];

            // Verificar se é MP4 ou precisa de conversão
            const fileExtension = fileName.split('.').pop()?.toLowerCase();
            const needsConversion = !['mp4'].includes(fileExtension || '');

            // Nome do arquivo final (MP4)
            const finalFileName = needsConversion ?
              fileName.replace(/\.[^/.]+$/, '.mp4') : fileName;

            // Construir URL HLS correta
            const isProduction = window.location.hostname !== 'localhost';
            const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
            videoUrl = `http://${wowzaHost}:1935/vod/_definst_/mp4:${userLogin}/${folderName}/${finalFileName}/playlist.m3u8`;
          }
        }

        return {
          ...item,
          videos: {
            ...video,
            url: videoUrl
          }
        };
      });

      setPlaylistVideos(processedVideos);
      return data;
    } catch (error) {
      console.error('Erro ao carregar vídeos da playlist:', error);
      return [];
    }
  };

  const handleStartPlaylist = async () => {
    if (!selectedPlaylist) {
      alert('Selecione uma playlist primeiro');
      return;
    }

    if (streamData.isLive) {
      const confirmStart = confirm(
        'Há uma transmissão ao vivo ativa. A playlist será iniciada após o término da transmissão atual. Deseja continuar?'
      );
      if (!confirmStart) return;
    }

    const videos = await loadPlaylistVideos(selectedPlaylist);
    if (videos.length === 0) {
      alert('A playlist selecionada não possui vídeos');
      return;
    }

    setCurrentVideoIndex(0);
    setIsPlayingPlaylist(true);
    setShowPlaylistModal(false);
  };

  const handleVideoEnd = () => {
    if (currentVideoIndex < playlistVideos.length - 1) {
      setCurrentVideoIndex(prev => prev + 1);
    } else {
      // Repetir playlist
      setCurrentVideoIndex(0);
    }
  };

  const stopPlaylist = () => {
    setIsPlayingPlaylist(false);
    setCurrentVideoIndex(0);
    setPlaylistVideos([]);
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const connectedPlatforms = streamData.platforms.filter(p => p.status === 'connected');

  const getCurrentVideo = () => {
    if (isPlayingPlaylist && playlistVideos.length > 0) {
      const currentItem = playlistVideos[currentVideoIndex];
      if (currentItem?.videos) {
        return {
          ...currentItem.videos,
          // Garantir que a URL está correta
          url: currentItem.videos.url || ''
        };
      }
    }
    return undefined;
  };

  // Determinar se há alguma transmissão ativa (OBS ou playlist)
  const hasActiveTransmission = streamData.isLive || (obsStatus?.is_live);
  const totalViewers = (streamData.viewers || 0) + (obsStatus?.viewers || 0);
  const activeBitrate = streamData.isLive ? streamData.bitrate : (obsStatus?.bitrate || 0);
  const activeUptime = streamData.isLive ? streamData.uptime : (obsStatus?.uptime || '00:00:00');

  // Função para construir URL de vídeo
  const buildVideoUrl = (url: string) => {
    if (!url) return '';

    // Se já é uma URL completa, usar como está
    if (url.startsWith('http')) {
      return url;
    }

    // Para vídeos SSH, usar URL diretamente
    if (url.includes('/api/videos-ssh/')) {
      return url;
    }

    // Garantir estrutura correta para nova organização
    const cleanPath = url.replace(/^\/+/, '');
    
    // Verificar se já tem o prefixo 'streaming'
    if (cleanPath.startsWith('streaming/')) {
      return `/content/${cleanPath}`;
    } else {
      return `/content/streaming/${cleanPath}`;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

        {hasActiveTransmission && (
          <div className="px-4 py-2 rounded-full flex items-center space-x-2 bg-green-100 text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="font-medium">
              {streamData.isLive && obsStatus?.is_live ? 'Múltiplas Transmissões' :
                streamData.isLive ? 'Transmissão Playlist' :
                  obsStatus?.is_live ? 'Transmissão OBS' : 'Transmissão Ativa'}
            </span>
          </div>
        )}

        {/* Link para conversão de vídeos */}
        <div className="mt-3">
          <Link
            to="/dashboard/conversao-videos"
            className="text-xs text-orange-700 hover:text-orange-900 underline flex items-center"
          >
            <Settings className="h-3 w-3 mr-1" />
            Otimizar vídeos para economizar espaço
          </Link>
        </div>
      </div>

      {/* Status das Transmissões Ativas */}
      {(streamData.isLive || obsStatus?.is_live) && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-green-800">Status das Transmissões</h2>
            <button
              onClick={() => {
                checkOBSStatus();
                // Atualizar também status de playlist se necessário
              }}
              className="text-green-600 hover:text-green-800"
              title="Atualizar status"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Transmissão de Playlist */}
            {streamData.isLive && (
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-green-800 flex items-center">
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Transmissão Playlist
                  </h3>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <div className="text-sm text-green-700 space-y-1">
                  <p>Espectadores: {streamData.viewers}</p>
                  <p>Bitrate: {streamData.bitrate} kbps</p>
                  <p>Tempo: {streamData.uptime}</p>
                  <p>Plataformas: {connectedPlatforms.length}</p>
                </div>
              </div>
            )}

            {/* Transmissão OBS */}
            {obsStatus?.is_live && (
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-blue-800 flex items-center">
                    <Radio className="h-4 w-4 mr-2" />
                    Transmissão OBS
                  </h3>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <button
                      onClick={stopOBSStream}
                      className="text-red-600 hover:text-red-800 text-xs"
                      title="Finalizar transmissão OBS"
                    >
                      <Square className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>Espectadores: {obsStatus.viewers}</p>
                  <p>Bitrate: {obsStatus.bitrate} kbps</p>
                  <p>Tempo: {obsStatus.uptime}</p>
                  <p>Gravação: {obsStatus.recording ? 'ATIVA' : 'INATIVA'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Aviso sobre múltiplas transmissões */}
          {streamData.isLive && obsStatus?.is_live && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start">
                <AlertCircle className="h-4 w-4 text-yellow-600 mr-2 mt-0.5" />
                <div className="text-yellow-800 text-sm">
                  <p className="font-medium">Múltiplas transmissões ativas</p>
                  <p>Você tem tanto uma transmissão de playlist quanto uma transmissão OBS ativas simultaneamente.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stream Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Eye className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Espectadores</p>
              <p className="text-2xl font-bold text-gray-900">{totalViewers}</p>
              <p className="text-xs text-gray-400">Em tempo real</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-lg">
              <Zap className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Bitrate</p>
              <p className="text-2xl font-bold text-gray-900">{activeBitrate}</p>
              <p className="text-xs text-gray-400">kbps</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Duração</p>
              <p className="text-2xl font-bold text-gray-900">{activeUptime}</p>
              <p className="text-xs text-gray-400">Tempo online</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Radio className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Plataformas</p>
              <p className="text-2xl font-bold text-gray-900">
                {connectedPlatforms.length + (obsStatus?.platforms?.length || 0)}
              </p>
              <p className="text-xs text-gray-400">Conectadas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Connected Platforms */}
      {hasActiveTransmission && (connectedPlatforms.length > 0 || (obsStatus?.platforms?.length || 0) > 0) && (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Plataformas Conectadas</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {connectedPlatforms.map((platform) => (
              <div key={platform.id} className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-green-800">{platform.name} (Playlist)</span>
              </div>
            ))}
            {obsStatus?.platforms?.map((platform, index) => (
              <div key={`obs-${index}`} className="flex items-center space-x-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-blue-800">{platform.name || 'OBS'} (OBS)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <BarChart className="h-6 w-6 text-accent" />
              <h2 className="ml-2 text-xl font-semibold text-gray-800">Informações do Usuário</h2>
            </div>
          </div>
          <hr className="mb-4 border-gray-200" />

          <div className="space-y-6">
            {/* Informações do Usuário */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-3 mb-3">
                <div className="h-12 w-12 bg-primary-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {user?.nome?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{user?.nome || 'Usuário'}</h3>
                  <p className="text-sm text-gray-600">{user?.email?.split('@')[0] || 'login'}</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${user?.tipo === 'revenda' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    }`}>
                    {user?.tipo === 'revenda' ? 'Revenda' : 'Streaming'}
                  </span>
                </div>
              </div>
            </div>

            {/* Dados do Plano */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bitrate */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Zap className="h-5 w-5 text-purple-600 mr-2" />
                    <span className="text-sm font-medium text-purple-800">Bitrate do Plano</span>
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold text-purple-900">{user?.bitrate || 0}</span>
                  <span className="text-sm text-purple-600">kbps</span>
                </div>
                <div className="mt-2 text-xs text-purple-600">
                  Atual: {activeBitrate} kbps
                </div>
              </div>

              {/* Espectadores */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center">
                    <Users className="h-5 w-5 text-green-600 mr-2" />
                    <span className="text-sm font-medium text-green-800">Espectadores Máx.</span>
                  </div>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-2xl font-bold text-green-900">{user?.espectadores || 0}</span>
                  <span className="text-sm text-green-600">máx</span>
                </div>
                <div className="mt-2 text-xs text-green-600">
                  Atual: {totalViewers} online
                </div>
              </div>
            </div>

            {/* Armazenamento */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <HardDrive className="h-5 w-5 text-orange-600 mr-2" />
                  <span className="text-sm font-medium text-orange-800">Armazenamento</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${storageData.percentage > 90 ? 'bg-red-100 text-red-800' :
                    storageData.percentage > 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-green-100 text-green-800'
                  }`}>
                  {storageData.percentage}% usado
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-orange-700">Usado:</span>
                  <span className="font-semibold text-orange-900">{storageData.used} MB</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-orange-700">Total do plano:</span>
                  <span className="font-semibold text-orange-900">{storageData.total} MB</span>
                </div>
                <div className="w-full bg-orange-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${storageData.percentage > 90 ? 'bg-red-600' :
                        storageData.percentage > 70 ? 'bg-yellow-600' :
                          'bg-orange-600'
                      }`}
                    style={{ width: `${Math.min(100, storageData.percentage)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-orange-700">Disponível:</span>
                  <span className={`font-semibold ${storageData.total - storageData.used > 100 ? 'text-green-700' : 'text-red-700'
                    }`}>
                    {storageData.total - storageData.used} MB
                  </span>
                </div>
              </div>

              {storageData.percentage > 90 && (
                <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-xs text-red-800">
                    ⚠️ Espaço quase esgotado! Remova vídeos antigos ou entre em contato para aumentar seu plano.
                  </p>
                </div>
              )}
            </div>

            {/* Tempo Online */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 text-blue-600 mr-2" />
                  <span className="text-sm font-medium text-blue-800">Tempo Online</span>
                </div>
                <span className="text-lg font-bold text-blue-900">{activeUptime}</span>
              </div>
              <div className="mt-2 text-xs text-blue-600">
                {hasActiveTransmission ? 'Transmitindo agora' : 'Última transmissão'}
              </div>
            </div>
          </div>
        </div>

        {/* Video Player Card */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <FileVideo className="h-6 w-6 text-accent" />
              <h2 className="ml-2 text-xl font-semibold text-gray-800">Player de Transmissão</h2>
            </div>
            <div className="flex items-center space-x-2">
              {obsStatus?.is_live && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  OBS ATIVO
                </span>
              )}
              <button
                onClick={() => setShowPlaylistModal(true)}
                className="px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700 text-sm flex items-center"
              >
                <Play className="h-4 w-4 mr-1" />
                Iniciar Playlist
              </button>
              {isPlayingPlaylist && (
                <button
                  onClick={stopPlaylist}
                  className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                >
                  Parar
                </button>
              )}
            </div>
          </div>
          <hr className="mb-4 border-gray-200" />

          {/* Player */}
          <div className="relative h-96">
            <AdvancedVideoPlayer
              src={getCurrentVideo()?.url ? buildVideoUrl(getCurrentVideo()!.url) : 
                   streamData.isLive ? `http://samhost.wcore.com.br:1935/samhost/${userLogin}_live/playlist.m3u8` :
                   obsStreamActive ? obsStreamUrl : undefined}
              title={getCurrentVideo()?.nome || 
                     streamData.isLive ? streamData.title || 'Transmissão ao Vivo' :
                     obsStreamActive ? 'Transmissão OBS ao Vivo' : undefined}
              isLive={!getCurrentVideo() && (streamData.isLive || obsStreamActive)}
              autoplay={false}
              controls={true}
              className="w-full h-full"
              aspectRatio="16:9"
              streamStats={hasActiveTransmission ? {
                viewers: totalViewers,
                bitrate: activeBitrate,
                uptime: activeUptime,
                quality: '1080p',
                isRecording: false
              } : undefined}
              onEnded={handleVideoEnd}
              enableSocialSharing={true}
              enableViewerCounter={hasActiveTransmission}
              enableWatermark={true}
            />

            {/* Overlay para playlist */}
            {isPlayingPlaylist && getCurrentVideo() && (
              <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded-md text-sm">
                <div className="flex items-center space-x-2">
                  <Play className="h-3 w-3" />
                  <span>Playlist: {currentVideoIndex + 1}/{playlistVideos.length}</span>
                </div>
                <div className="text-xs opacity-80 truncate max-w-48">
                  {getCurrentVideo()?.nome}
                </div>
              </div>
            )}

            {/* Overlay para OBS */}
            {obsStatus?.is_live && !isPlayingPlaylist && (
              <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded-md text-sm">
                <div className="flex items-center space-x-2">
                  <Radio className="h-3 w-3" />
                  <span>Transmissão OBS Ativa</span>
                </div>
                <div className="text-xs opacity-80">
                  {obsStatus.viewers} espectadores • {obsStatus.bitrate} kbps
                </div>
              </div>
            )}
          </div>

          {/* Controles da playlist */}
          {isPlayingPlaylist && playlistVideos.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  Reproduzindo Playlist
                </span>
                <span className="text-xs text-gray-500">
                  {currentVideoIndex + 1} de {playlistVideos.length}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentVideoIndex(Math.max(0, currentVideoIndex - 1))}
                  disabled={currentVideoIndex === 0}
                  className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs disabled:opacity-50"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setCurrentVideoIndex(Math.min(playlistVideos.length - 1, currentVideoIndex + 1))}
                  disabled={currentVideoIndex === playlistVideos.length - 1}
                  className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs disabled:opacity-50"
                >
                  Próximo
                </button>
                <button
                  onClick={stopPlaylist}
                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                >
                  Parar Playlist
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Management Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Streaming Management */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Play className="h-6 w-6 text-accent" />
              <h2 className="ml-2 text-xl font-semibold text-gray-800">Gerenciamento de Transmissão</h2>
            </div>
          </div>
          <hr className="mb-4 border-gray-200" />

          <div className="grid grid-cols-3 gap-4">
            <Link to="/dashboard/iniciar-transmissao" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-green-100 text-green-600 rounded-full mb-2">
                <Radio className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Iniciar Transmissão</span>
            </Link>

            <Link to="/dashboard/dados-conexao" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Settings className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Dados Conexão</span>
            </Link>

            <Link to="/dashboard/configuracoes" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Settings className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Configurações</span>
            </Link>

            <Link to="/dashboard/players" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <PlayCircle className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Players</span>
            </Link>

            <Link to="/dashboard/espectadores" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Users className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Espectadores</span>
            </Link>

            <div className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <BarChart className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Estatísticas</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Settings className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Gravar Stream</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Smartphone className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">App Mobile</span>
            </div>

            <div className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <RefreshCw className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Controles</span>
            </div>
          </div>
        </div>

        {/* On-demand Management */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Wifi className="h-6 w-6 text-accent" />
              <h2 className="ml-2 text-xl font-semibold text-gray-800">Gerenciamento de Conteúdo</h2>
            </div>
          </div>
          <hr className="mb-4 border-gray-200" />

          <div className="grid grid-cols-3 gap-4">
            <button
              onClick={() => setShowPlaylistModal(true)}
              className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <PlayCircle className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Iniciar Playlist</span>
            </button>

            <Link to="/dashboard/gerenciarvideos" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <FolderPlus className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Gerenciar Vídeos</span>
            </Link>

            <Link to="/dashboard/playlists" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <FolderPlus className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Playlists</span>
            </Link>

            <Link to="/dashboard/agendamentos" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Calendar className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Agendamentos</span>
            </Link>

            <Link to="/dashboard/comerciais" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Megaphone className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Comerciais</span>
            </Link>

            <Link to="/dashboard/downloadyoutube" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <Youtube className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Download YouTube</span>
            </Link>

            <Link to="/dashboard/migrar-videos-ftp" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full mb-2">
                <Server className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Migrar FTP</span>
            </Link>

            <Link to="/dashboard/relayrtmp" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-primary-100 text-primary-600 rounded-full mb-2">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Relay RTMP</span>
            </Link>

            <Link to="/dashboard/conversao-videos" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-purple-100 text-purple-600 rounded-full mb-2">
                <Settings className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">Conversão Vídeos</span>
            </Link>

            <Link to="/dashboard/app-multiplataforma" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full mb-2">
                <Smartphone className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">App Multiplataforma</span>
            </Link>

            <Link to="/dashboard/app-android" className="flex flex-col items-center justify-center p-3 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 flex items-center justify-center bg-green-100 text-green-600 rounded-full mb-2">
                <Smartphone className="h-6 w-6" />
              </div>
              <span className="text-sm text-gray-700 text-center">App Android</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Modal para selecionar playlist */}
      {showPlaylistModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Selecionar Playlist</h3>

            {hasActiveTransmission && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-yellow-800 text-sm">
                  ⚠️ {streamData.isLive && obsStatus?.is_live ?
                    'Há transmissões ativas (Playlist + OBS). A nova playlist será reproduzida localmente.' :
                    streamData.isLive ?
                      'Há uma transmissão de playlist ativa. A nova playlist será reproduzida localmente.' :
                      'Há uma transmissão OBS ativa. A playlist será reproduzida localmente.'}
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Escolha uma playlist:
              </label>
              <select
                value={selectedPlaylist}
                onChange={(e) => setSelectedPlaylist(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Selecione uma playlist...</option>
                {playlists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowPlaylistModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={handleStartPlaylist}
                disabled={!selectedPlaylist}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 flex items-center"
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar Playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;