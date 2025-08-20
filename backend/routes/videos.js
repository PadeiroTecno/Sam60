const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const SSHManager = require('../config/SSHManager');
const wowzaService = require('../config/WowzaStreamingService');
const { spawn } = require('child_process');

const router = express.Router();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const tempDir = '/tmp/video-uploads';
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_');
    cb(null, `${Date.now()}_${sanitizedName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    // Lista expandida de tipos MIME para vídeos
    const allowedTypes = [
      'video/mp4', 'video/avi', 'video/quicktime', 'video/x-msvideo',
      'video/wmv', 'video/x-ms-wmv', 'video/flv', 'video/x-flv',
      'video/webm', 'video/mkv', 'video/x-matroska', 'video/3gpp',
      'video/3gpp2', 'video/mp2t', 'video/mpeg', 'video/ogg',
      'application/octet-stream' // Para arquivos que podem não ter MIME correto
    ];

    // Verificar também por extensão para todos os formatos
    const fileName = file.originalname.toLowerCase();
    const hasValidExtension = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.3gp', '.3g2', '.ts', '.mpg', '.mpeg', '.ogv', '.m4v', '.asf'
    ].some(ext =>
      fileName.endsWith(ext)
    );

    if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}. Extensões aceitas: .mp4, .avi, .mov, .wmv, .flv, .webm, .mkv, .3gp, .ts, .mpg, .ogv, .m4v`), false);
    }
  }
});

// Função para obter informações do vídeo via ffprobe
const getVideoInfo = async (filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0 && stdout) {
        try {
          const info = JSON.parse(stdout);
          resolve(info);
        } catch (parseError) {
          reject(new Error('Erro ao analisar informações do vídeo'));
        }
      } else {
        reject(new Error('Erro ao obter informações do vídeo'));
      }
    });

    ffprobe.on('error', (error) => {
      reject(error);
    });
  });
};

// Função para verificar se codec é compatível
const isCompatibleCodec = (codecName) => {
  const compatibleCodecs = ['h264', 'h265', 'hevc'];
  return compatibleCodecs.includes(codecName?.toLowerCase());
};

// Função para verificar se formato é compatível
const isCompatibleFormat = (formatName, extension) => {
  const compatibleFormats = ['mp4'];
  return compatibleFormats.includes(extension?.toLowerCase()?.replace('.', ''));
};

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const folderId = req.query.folder_id;
    if (!folderId) {
      return res.status(400).json({ error: 'folder_id é obrigatório' });
    }

    // Buscar dados da pasta
    const [folderRows] = await db.execute(
      'SELECT identificacao FROM streamings WHERE codigo = ? AND codigo_cliente = ?',
      [folderId, userId]
    );
    if (folderRows.length === 0) {
      return res.status(404).json({ error: 'Pasta não encontrada' });
    }

    const folderName = folderRows[0].identificacao;
    const userLogin = req.user.email.split('@')[0];

    // Buscar vídeos na tabela videos usando pasta
    const [rows] = await db.execute(
      `SELECT 
        id,
        nome,
        url,
        caminho,
        duracao,
        tamanho_arquivo as tamanho,
        bitrate_video,
        formato_original,
        codec_video,
        is_mp4,
        compativel,
        largura,
        altura
       FROM videos 
       WHERE codigo_cliente = ? AND pasta = ?
       ORDER BY id DESC`,
      [userId, folderId]
    );

    console.log(`📁 Buscando vídeos na pasta: ${folderName} (ID: ${folderId})`);
    console.log(`📊 Encontrados ${rows.length} vídeos no banco`);

    // Buscar limite de bitrate do usuário
    const userBitrateLimit = req.user.bitrate || 2500;

    const videos = rows.map(video => {
      // Construir URL correta baseada no caminho
      let url = video.url || video.caminho;
      
      // Se não tem URL, construir baseado no caminho
      if (!url && video.caminho) {
        url = video.caminho;
      }
      
      // Se ainda não tem URL, construir padrão
      if (!url) {
        url = `${userLogin}/${folderName}/${video.nome}`;
      }
      
      // Garantir que a URL está no formato correto
      if (url.includes('/usr/local/WowzaStreamingEngine/content/')) {
        url = url.replace('/usr/local/WowzaStreamingEngine/content/', '');
      }
      
      // Remover barra inicial se existir
      if (url.startsWith('/')) {
        url = url.substring(1);
      }

      console.log(`🎥 Vídeo: ${video.nome} -> URL: ${url}`);

      // Verificar se bitrate excede o limite
      const currentBitrate = video.bitrate_video || 0;
      const bitrateExceedsLimit = currentBitrate > userBitrateLimit;
      
      // Verificar compatibilidade de formato e codec
      const fileExtension = path.extname(video.nome).toLowerCase();
      const isMP4 = video.is_mp4 === 1;
      const codecCompatible = isCompatibleCodec(video.codec_video);
      const formatCompatible = isCompatibleFormat(video.formato_original, fileExtension);
      
      // Determinar se precisa de conversão
      const needsConversion = !isMP4 || !codecCompatible || !formatCompatible;
      
      // Status de compatibilidade
      let compatibilityStatus = 'compatible';
      let compatibilityMessage = 'Compatível';
      
      if (needsConversion) {
        compatibilityStatus = 'needs_conversion';
        compatibilityMessage = 'Necessário Conversão';
      } else if (bitrateExceedsLimit) {
        compatibilityStatus = 'bitrate_high';
        compatibilityMessage = 'Bitrate Alto';
      }
      
      return {
        id: video.id,
        nome: video.nome,
        url,
        duracao: video.duracao,
        tamanho: video.tamanho,
        bitrate_video: video.bitrate_video,
        formato_original: video.formato_original,
        codec_video: video.codec_video,
        is_mp4: video.is_mp4,
        compativel: video.compativel,
        largura: video.largura,
        altura: video.altura,
        folder: folderName,
        user: userLogin,
        user_bitrate_limit: userBitrateLimit,
        bitrate_exceeds_limit: bitrateExceedsLimit,
        needs_conversion: needsConversion,
        compatibility_status: compatibilityStatus,
        compatibility_message: compatibilityMessage,
        codec_compatible: codecCompatible,
        format_compatible: formatCompatible
      };
    });

    console.log(`✅ Retornando ${videos.length} vídeos com informações de compatibilidade`);
    res.json(videos);
  } catch (err) {
    console.error('Erro ao buscar vídeos:', err);
    res.status(500).json({ error: 'Erro ao buscar vídeos', details: err.message });
  }
});

router.post('/upload', authMiddleware, upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const userId = req.user.id;
    const userLogin = req.user.email.split('@')[0];
    const folderId = req.query.folder_id || 'default';

    console.log(`📤 Upload iniciado - Usuário: ${userLogin}, Pasta: ${folderId}, Arquivo: ${req.file.originalname}`);
    console.log(`📋 Tipo MIME: ${req.file.mimetype}, Tamanho: ${req.file.size} bytes`);

    // Verificar se é um formato de vídeo válido
    const videoExtensions = [
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv',
      '.3gp', '.3g2', '.ts', '.mpg', '.mpeg', '.ogv', '.m4v', '.asf'
    ];
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    if (!videoExtensions.includes(fileExtension)) {
      console.log(`❌ Extensão não suportada: ${fileExtension}`);
      await fs.unlink(req.file.path).catch(() => { });
      return res.status(400).json({
        error: `Formato de arquivo não suportado: ${fileExtension}`,
        details: `Formatos aceitos: ${videoExtensions.join(', ')}`
      });
    }

    // Obter informações reais do vídeo usando ffprobe
    let videoInfo = null;
    let duracao = 0;
    let bitrateVideo = 0;
    let codecVideo = 'unknown';
    let largura = 0;
    let altura = 0;
    let formatoOriginal = fileExtension.substring(1);
    
    try {
      console.log(`🔍 Analisando vídeo: ${req.file.path}`);
      videoInfo = await getVideoInfo(req.file.path);
      
      if (videoInfo.format) {
        duracao = Math.floor(parseFloat(videoInfo.format.duration) || 0);
        bitrateVideo = Math.floor(parseInt(videoInfo.format.bit_rate) / 1000) || 0; // Converter para kbps
        formatoOriginal = videoInfo.format.format_name || fileExtension.substring(1);
      }
      
      if (videoInfo.streams) {
        const videoStream = videoInfo.streams.find(s => s.codec_type === 'video');
        if (videoStream) {
          codecVideo = videoStream.codec_name || 'unknown';
          largura = videoStream.width || 0;
          altura = videoStream.height || 0;
          
          // Se não conseguiu bitrate do format, tentar do stream
          if (!bitrateVideo && videoStream.bit_rate) {
            bitrateVideo = Math.floor(parseInt(videoStream.bit_rate) / 1000) || 0;
          }
        }
      }
      
      console.log(`📊 Informações do vídeo:`, {
        duracao,
        bitrateVideo,
        codecVideo,
        largura,
        altura,
        formatoOriginal
      });
    } catch (probeError) {
      console.warn('⚠️ Não foi possível analisar o vídeo com ffprobe:', probeError.message);
      // Continuar com valores padrão
    }
    
    const tamanho = req.file.size;

    const [userRows] = await db.execute(
      `SELECT 
        s.codigo_servidor, s.identificacao as folder_name,
        s.espaco, s.espaco_usado
       FROM streamings s 
       WHERE s.codigo = ? AND (s.codigo_cliente = ? OR s.codigo = ?)`,
      [folderId, userId, userId]
    );
    if (userRows.length === 0) {
      console.log(`❌ Pasta ${folderId} não encontrada para usuário ${userId}`);
      return res.status(404).json({ error: 'Pasta não encontrada' });
    }

    const userData = userRows[0];
    const serverId = userData.codigo_servidor || 1;
    const folderName = userData.folder_name;

    console.log(`📁 Pasta encontrada: ${folderName}, Servidor: ${serverId}`);

    const spaceMB = Math.ceil(tamanho / (1024 * 1024));
    const availableSpace = userData.espaco - userData.espaco_usado;

    if (spaceMB > availableSpace) {
      console.log(`❌ Espaço insuficiente: ${spaceMB}MB necessário, ${availableSpace}MB disponível`);
      await fs.unlink(req.file.path).catch(() => { });
      return res.status(400).json({
        error: `Espaço insuficiente. Necessário: ${spaceMB}MB, Disponível: ${availableSpace}MB`,
        details: `Seu plano permite ${userData.espaco}MB de armazenamento. Atualmente você está usando ${userData.espaco_usado}MB. Para enviar este arquivo, você precisa de mais ${spaceMB - availableSpace}MB livres.`,
        spaceInfo: {
          required: spaceMB,
          available: availableSpace,
          total: userData.espaco,
          used: userData.espaco_usado,
          percentage: Math.round((userData.espaco_usado / userData.espaco) * 100)
        }
      });
    }

    try {
      // Garantir que estrutura completa do usuário existe
      await SSHManager.createCompleteUserStructure(serverId, userLogin, {
        bitrate: req.user.bitrate || 2500,
        espectadores: req.user.espectadores || 100,
        status_gravando: 'nao'
      });
      await SSHManager.createUserFolder(serverId, userLogin, folderName);

      // Estrutura correta: /home/streaming/[usuario]/[pasta]/arquivo
      const remotePath = `/home/streaming/${userLogin}/${folderName}/${req.file.filename}`;
      await SSHManager.uploadFile(serverId, req.file.path, remotePath);
      await fs.unlink(req.file.path);

      console.log(`✅ Arquivo enviado para: ${remotePath}`);
      console.log(`📂 Estrutura: /home/streaming/${userLogin}/${folderName}/${req.file.filename}`);

      // Construir caminho relativo para salvar no banco
      const relativePath = `${userLogin}/${folderName}/${req.file.filename}`;
      console.log(`💾 Salvando no banco com path: ${relativePath}`);

      // Nome do vídeo para salvar no banco
      const videoTitle = req.file.originalname;

      // Verificar compatibilidade
      const isMP4 = fileExtension === '.mp4';
      const codecCompatible = isCompatibleCodec(codecVideo);
      const formatCompatible = isCompatibleFormat(formatoOriginal, fileExtension);
      const needsConversion = !isMP4 || !codecCompatible;
      
      // Status de compatibilidade
      let compatibilityStatus = needsConversion ? 'nao' : 'sim';

      // Salvar na tabela videos SEM conversão automática
      const [result] = await db.execute(
        `INSERT INTO videos (
          nome, descricao, url, caminho, duracao, tamanho_arquivo,
          codigo_cliente, pasta, bitrate_video, formato_original, codec_video,
          largura, altura, is_mp4, compativel
        ) VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          videoTitle,
          relativePath,
          remotePath,
          duracao,
          tamanho,
          userId,
          folderId,
          bitrateVideo,
          formatoOriginal,
          codecVideo,
          largura,
          altura,
          isMP4 ? 1 : 0,
          compatibilityStatus
        ]
      );

      // Atualizar espaço usado na pasta
      await db.execute(
        'UPDATE streamings SET espaco_usado = espaco_usado + ? WHERE codigo = ?',
        [spaceMB, folderId]
      );

      console.log(`✅ Vídeo salvo no banco com ID: ${result.insertId}`);

      // Atualizar arquivo SMIL do usuário após upload
      try {
        const PlaylistSMILService = require('../services/PlaylistSMILService');
        await PlaylistSMILService.updateUserSMIL(userId, userLogin, serverId);
        console.log(`✅ Arquivo SMIL atualizado após upload para usuário ${userLogin}`);
      } catch (smilError) {
        console.warn('Erro ao atualizar arquivo SMIL:', smilError.message);
      }
      // Construir URLs corretas SEM conversão automática
      const finalRelativePath = relativePath;

      // Determinar status de compatibilidade para resposta
      let statusMessage = 'Vídeo compatível';
      let statusColor = 'green';
      
      if (needsConversion) {
        statusMessage = 'Necessário Conversão';
        statusColor = 'red';
      } else if (bitrateVideo > userBitrateLimit) {
        statusMessage = 'Bitrate Alto';
        statusColor = 'yellow';
      }

      res.status(201).json({
        id: result.insertId,
        nome: videoTitle,
        url: finalRelativePath,
        path: remotePath,
        originalFile: remotePath,
        bitrate_video: bitrateVideo,
        codec_video: codecVideo,
        formato_original: fileExtension.substring(1),
        largura: largura,
        altura: altura,
        is_mp4: fileExtension === '.mp4',
        needs_conversion: needsConversion,
        compatibility_status: statusMessage,
        compatibility_color: statusColor,
        duracao,
        tamanho,
        space_used_mb: spaceMB
      });
    } catch (uploadError) {
      console.error('Erro durante upload:', uploadError);
      await fs.unlink(req.file.path).catch(() => { });
      throw uploadError;
    }
  } catch (err) {
    console.error('Erro no upload:', err);
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => { });
    }
    res.status(500).json({ error: 'Erro no upload do vídeo', details: err.message });
  }
});

// Função auxiliar para formatar duração
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Rota para testar acesso a vídeos
router.get('/test/:userId/:folder/:filename', authMiddleware, async (req, res) => {
  try {
    const { userId, folder, filename } = req.params;
    const userLogin = req.user.email.split('@')[0];

    // Verificar se arquivo existe no servidor via SSH
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;
    const remotePath = `/usr/local/WowzaStreamingEngine/content/${userLogin}/${folder}/${filename}`;

    try {
      const fileInfo = await SSHManager.getFileInfo(serverId, remotePath);

      if (fileInfo.exists) {
        res.json({
          success: true,
          exists: true,
          path: remotePath,
          info: fileInfo,
          url: `/content/${userLogin}/${folder}/${filename}`
        });
      } else {
        res.json({
          success: false,
          url: `/content${relativePath}`,
          error: 'Arquivo não encontrado no servidor'
        });
      }
    } catch (sshError) {
      res.status(500).json({
        success: false,
        error: 'Erro ao verificar arquivo no servidor',
        details: sshError.message
      });
    }
  } catch (err) {
    console.error('Erro no teste de vídeo:', err);
    res.status(500).json({ error: 'Erro no teste de vídeo', details: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.id;
    const userId = req.user.id;
    const userLogin = req.user.usuario || req.user.email?.split('@')[0] || `user_${userId}`;

    // Buscar dados do vídeo
    const [videoRows] = await db.execute(
      'SELECT caminho, nome, tamanho_arquivo, pasta FROM videos WHERE id = ? AND (codigo_cliente = ? OR codigo_cliente IN (SELECT codigo FROM streamings WHERE codigo_cliente = ?))',
      [videoId, userId, userId]
    );
    if (videoRows.length === 0) {
      return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    const { caminho, tamanho_arquivo, pasta } = videoRows[0];

    if (!caminho.includes(`/${userLogin}/`)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Buscar servidor para execução via SSH
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );
    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    let fileSize = tamanho_arquivo || 0;
    // Estrutura correta: verificar se já está no formato correto
    const remotePath = caminho.startsWith('/home/streaming') ? 
      caminho : `/home/streaming/${caminho}`;

    // Verificar tamanho real do arquivo via SSH, se necessário
    if (!fileSize) {
      try {
        const fileInfo = await SSHManager.getFileInfo(serverId, remotePath);
        fileSize = fileInfo.exists ? fileInfo.size : 0;
      } catch (err) {
        console.warn('Não foi possível verificar tamanho do arquivo via SSH:', err.message);
      }
    }

    // Remover arquivo via SSH
    try {
      await SSHManager.deleteFile(serverId, remotePath);
      console.log(`✅ Arquivo remoto removido: ${remotePath}`);
      
      // Atualizar arquivo SMIL do usuário após remoção
      try {
        const PlaylistSMILService = require('../services/PlaylistSMILService');
        await PlaylistSMILService.updateUserSMIL(userId, userLogin, serverId);
        console.log(`✅ Arquivo SMIL atualizado após remoção de vídeo para usuário ${userLogin}`);
      } catch (smilError) {
        console.warn('Erro ao atualizar arquivo SMIL:', smilError.message);
      }
    } catch (err) {
      console.warn('Erro ao deletar arquivo remoto:', err.message);
    }

    // Remover vídeo da tabela videos
    await db.execute('DELETE FROM videos WHERE id = ?', [videoId]);
    
    // Calcular espaço liberado
    const spaceMB = Math.ceil((fileSize) / (1024 * 1024));
    
    // Atualizar espaço usado na pasta específica
    await db.execute(
      'UPDATE streamings SET espaco_usado = GREATEST(espaco_usado - ?, 0) WHERE codigo = ?',
      [spaceMB, pasta]
    );
    
    console.log(`📊 Espaço liberado: ${spaceMB}MB`);

    return res.json({ success: true, message: 'Vídeo removido com sucesso' });
  } catch (err) {
    console.error('Erro ao remover vídeo:', err);
    return res.status(500).json({ error: 'Erro ao remover vídeo', details: err.message });
  }
});

module.exports = router;