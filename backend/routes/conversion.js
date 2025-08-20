const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');
const VideoSSHManager = require('../config/VideoSSHManager');
const SSHManager = require('../config/SSHManager');

const router = express.Router();

// GET /api/conversion/videos - Lista vídeos para conversão
router.get('/videos', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;
    const folderId = req.query.folder_id;

    let whereClause = 'WHERE v.codigo_cliente = ?';
    const params = [userId];

    if (folderId) {
      whereClause += ' AND v.pasta = ?';
      params.push(folderId);
    }

    // Buscar vídeos do banco com informações de conversão
    const [rows] = await db.execute(
      `SELECT 
        v.id,
        v.nome,
        v.url,
        v.caminho,
        v.duracao,
        v.tamanho_arquivo as tamanho,
        v.bitrate_video,
        v.formato_original,
        v.is_mp4,
        v.compativel,
        v.pasta,
        s.bitrate as user_bitrate_limit,
        s.identificacao as folder_name
       FROM videos v
       LEFT JOIN streamings s ON v.pasta = s.codigo
       ${whereClause}
       ORDER BY v.id DESC`,
      params
    );

    const videos = rows.map(video => {
      const currentBitrate = video.bitrate_video || 0;
      const userBitrateLimit = video.user_bitrate_limit || 2500;
      const needsConversion = !video.is_mp4 || currentBitrate > userBitrateLimit;

      // Qualidades disponíveis baseadas no limite do usuário
      const availableQualities = [
        {
          quality: 'baixa',
          bitrate: 800,
          resolution: '854x480',
          canConvert: 800 <= userBitrateLimit,
          description: 'Qualidade básica para conexões lentas',
          customizable: true
        },
        {
          quality: 'media',
          bitrate: 1500,
          resolution: '1280x720',
          canConvert: 1500 <= userBitrateLimit,
          description: 'Qualidade média, boa para a maioria dos casos',
          customizable: true
        },
        {
          quality: 'alta',
          bitrate: 2500,
          resolution: '1920x1080',
          canConvert: 2500 <= userBitrateLimit,
          description: 'Alta qualidade para transmissões profissionais',
          customizable: true
        },
        {
          quality: 'fullhd',
          bitrate: Math.min(4000, userBitrateLimit),
          resolution: '1920x1080',
          canConvert: userBitrateLimit >= 3000,
          description: 'Máxima qualidade disponível no seu plano',
          customizable: true
        },
        {
          quality: 'custom',
          bitrate: 0,
          resolution: 'Personalizada',
          canConvert: true,
          description: 'Configure bitrate e resolução personalizados',
          customizable: true
        }
      ];

      return {
        id: video.id,
        nome: video.nome,
        url: video.url,
        duracao: video.duracao,
        tamanho: video.tamanho,
        bitrate_video: video.bitrate_video,
        formato_original: video.formato_original,
        is_mp4: video.is_mp4 === 1,
        current_bitrate: currentBitrate,
        bitrate_original: currentBitrate,
        user_bitrate_limit: userBitrateLimit,
        available_qualities: availableQualities,
        can_use_current: video.is_mp4 === 1 && currentBitrate <= userBitrateLimit,
        needs_conversion: needsConversion,
        conversion_status: video.compativel === 'sim' ? 'disponivel' : 'nao_iniciada',
        folder_name: video.folder_name
      };
    });

    res.json({
      success: true,
      videos: videos
    });
  } catch (err) {
    console.error('Erro ao buscar vídeos para conversão:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar vídeos para conversão', 
      details: err.message 
    });
  }
});

// GET /api/conversion/qualities - Lista qualidades disponíveis
router.get('/qualities', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userBitrateLimit = req.user.bitrate || 2500;

    const qualities = [
      {
        quality: 'baixa',
        label: 'Baixa (480p)',
        bitrate: 800,
        resolution: '854x480',
        available: 800 <= userBitrateLimit,
        description: 'Qualidade básica para conexões lentas'
      },
      {
        quality: 'media',
        label: 'Média (720p)',
        bitrate: 1500,
        resolution: '1280x720',
        available: 1500 <= userBitrateLimit,
        description: 'Qualidade média, boa para a maioria dos casos'
      },
      {
        quality: 'alta',
        label: 'Alta (1080p)',
        bitrate: 2500,
        resolution: '1920x1080',
        available: 2500 <= userBitrateLimit,
        description: 'Alta qualidade para transmissões profissionais'
      },
      {
        quality: 'fullhd',
        label: 'Full HD (1080p+)',
        bitrate: Math.min(4000, userBitrateLimit),
        resolution: '1920x1080',
        available: userBitrateLimit >= 3000,
        description: 'Máxima qualidade disponível no seu plano'
      },
      {
        quality: 'custom',
        label: 'Personalizado',
        bitrate: 0,
        resolution: 'Personalizada',
        available: true,
        description: 'Configure bitrate e resolução personalizados'
      }
    ];

    res.json({
      success: true,
      qualities: qualities,
      user_bitrate_limit: userBitrateLimit
    });
  } catch (err) {
    console.error('Erro ao buscar qualidades:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao buscar qualidades', 
      details: err.message 
    });
  }
});

// POST /api/conversion/convert - Iniciar conversão de vídeo
router.post('/convert', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userLogin = req.user.email ? req.user.email.split('@')[0] : `user_${userId}`;
    const { video_id, quality, custom_bitrate, custom_resolution, use_custom } = req.body;

    if (!video_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'ID do vídeo é obrigatório' 
      });
    }

    // Buscar dados do vídeo
    const [videoRows] = await db.execute(
      'SELECT * FROM videos WHERE id = ? AND codigo_cliente = ?',
      [video_id, userId]
    );

    if (videoRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Vídeo não encontrado' 
      });
    }

    const video = videoRows[0];
    const userBitrateLimit = req.user.bitrate || 2500;

    // Determinar configurações de conversão
    let targetBitrate, targetResolution, qualityLabel;

    if (use_custom || quality === 'custom') {
      if (!custom_bitrate || !custom_resolution) {
        return res.status(400).json({ 
          success: false, 
          error: 'Bitrate e resolução customizados são obrigatórios para conversão personalizada' 
        });
      }

      if (custom_bitrate > userBitrateLimit) {
        return res.status(400).json({ 
          success: false, 
          error: `Bitrate customizado (${custom_bitrate} kbps) excede o limite do plano (${userBitrateLimit} kbps)` 
        });
      }

      targetBitrate = custom_bitrate;
      targetResolution = custom_resolution;
      qualityLabel = `Personalizado (${custom_bitrate} kbps)`;
    } else {
      // Qualidades predefinidas
      const qualitySettings = {
        baixa: { bitrate: 800, resolution: '854x480', label: 'Baixa (480p)' },
        media: { bitrate: 1500, resolution: '1280x720', label: 'Média (720p)' },
        alta: { bitrate: 2500, resolution: '1920x1080', label: 'Alta (1080p)' },
        fullhd: { bitrate: Math.min(4000, userBitrateLimit), resolution: '1920x1080', label: 'Full HD (1080p+)' }
      };

      const settings = qualitySettings[quality];
      if (!settings) {
        return res.status(400).json({ 
          success: false, 
          error: 'Qualidade inválida' 
        });
      }

      if (settings.bitrate > userBitrateLimit) {
        return res.status(400).json({ 
          success: false, 
          error: `Qualidade selecionada excede o limite do plano (${userBitrateLimit} kbps)` 
        });
      }

      targetBitrate = settings.bitrate;
      targetResolution = settings.resolution;
      qualityLabel = settings.label;
    }

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Construir caminhos
    const inputPath = video.caminho.startsWith('/usr/local/WowzaStreamingEngine/content') ? 
      video.caminho : `/usr/local/WowzaStreamingEngine/content/${video.caminho}`;
    
    const outputPath = inputPath.replace(/\.[^/.]+$/, `_${targetBitrate}kbps.mp4`);

    // Verificar se arquivo de entrada existe
    const inputExists = await SSHManager.getFileInfo(serverId, inputPath);
    if (!inputExists.exists) {
      return res.status(404).json({ 
        success: false, 
        error: 'Arquivo de vídeo não encontrado no servidor' 
      });
    }

    // Verificar se conversão já existe
    const outputExists = await SSHManager.getFileInfo(serverId, outputPath);
    if (outputExists.exists) {
      return res.status(400).json({ 
        success: false, 
        error: 'Já existe uma conversão com essas configurações' 
      });
    }

    // Comando FFmpeg para conversão
    const [width, height] = targetResolution.split('x');
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -b:v ${targetBitrate}k -maxrate ${targetBitrate}k -bufsize ${targetBitrate * 2}k -vf scale=${width}:${height} -c:a aac -b:a 128k -movflags +faststart "${outputPath}" -y 2>/dev/null && echo "CONVERSION_SUCCESS" || echo "CONVERSION_ERROR"`;

    console.log(`🔄 Iniciando conversão: ${video.nome} -> ${qualityLabel}`);

    // Executar conversão via SSH (assíncrono)
    SSHManager.executeCommand(serverId, ffmpegCommand)
      .then(result => {
        if (result.stdout.includes('CONVERSION_SUCCESS')) {
          console.log(`✅ Conversão concluída: ${video.nome} -> ${qualityLabel}`);
          
          // Atualizar banco com nova versão convertida
          db.execute(
            `INSERT INTO videos (
              nome, url, caminho, duracao, tamanho_arquivo,
              codigo_cliente, pasta, bitrate_video, formato_original,
              largura, altura, is_mp4, compativel, qualidade_conversao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mp4', ?, ?, 1, 'sim', ?)`,
            [
              `${video.nome} (${qualityLabel})`,
              video.url.replace(/\.[^/.]+$/, `_${targetBitrate}kbps.mp4`),
              outputPath,
              video.duracao,
              0, // Tamanho será calculado depois
              userId,
              video.pasta,
              targetBitrate,
              width,
              height,
              qualityLabel
            ]
          ).catch(dbError => {
            console.error('Erro ao salvar conversão no banco:', dbError);
          });
        } else {
          console.error(`❌ Erro na conversão: ${video.nome}`);
        }
      })
      .catch(conversionError => {
        console.error('Erro na conversão:', conversionError);
      });

    res.json({
      success: true,
      message: `Conversão iniciada: ${video.nome} -> ${qualityLabel}`,
      conversion_id: `${video_id}_${targetBitrate}`,
      target_bitrate: targetBitrate,
      target_resolution: targetResolution,
      quality_label: qualityLabel
    });

  } catch (err) {
    console.error('Erro ao iniciar conversão:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao iniciar conversão', 
      details: err.message 
    });
  }
});

// GET /api/conversion/status/:videoId - Verificar status da conversão
router.get('/status/:videoId', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const userId = req.user.id;

    // Buscar conversões do vídeo
    const [conversionRows] = await db.execute(
      `SELECT 
        id, nome, qualidade_conversao, bitrate_video,
        caminho, tamanho_arquivo
       FROM videos 
       WHERE codigo_cliente = ? AND (id = ? OR nome LIKE ?)
       ORDER BY id DESC`,
      [userId, videoId, `%${videoId}%`]
    );

    if (conversionRows.length === 0) {
      return res.json({
        success: true,
        conversion_status: {
          status: 'nao_iniciada',
          progress: 0
        }
      });
    }

    // Verificar se arquivo convertido existe no servidor
    const conversion = conversionRows[0];
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;
    const fileExists = await SSHManager.getFileInfo(serverId, conversion.caminho);

    const status = fileExists.exists ? 'concluida' : 'em_andamento';

    res.json({
      success: true,
      conversion_status: {
        status: status,
        progress: status === 'concluida' ? 100 : 50,
        quality: conversion.qualidade_conversao,
        bitrate: conversion.bitrate_video,
        file_size: conversion.tamanho_arquivo || 0
      }
    });

  } catch (err) {
    console.error('Erro ao verificar status da conversão:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao verificar status da conversão', 
      details: err.message 
    });
  }
});

// DELETE /api/conversion/:videoId - Remover conversão
router.delete('/:videoId', authMiddleware, async (req, res) => {
  try {
    const videoId = req.params.videoId;
    const userId = req.user.id;

    // Buscar vídeo convertido
    const [videoRows] = await db.execute(
      'SELECT caminho, nome FROM videos WHERE id = ? AND codigo_cliente = ? AND qualidade_conversao IS NOT NULL',
      [videoId, userId]
    );

    if (videoRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Conversão não encontrada' 
      });
    }

    const video = videoRows[0];

    // Buscar servidor do usuário
    const [serverRows] = await db.execute(
      'SELECT codigo_servidor FROM streamings WHERE codigo_cliente = ? LIMIT 1',
      [userId]
    );

    const serverId = serverRows.length > 0 ? serverRows[0].codigo_servidor : 1;

    // Remover arquivo do servidor
    try {
      await SSHManager.deleteFile(serverId, video.caminho);
      console.log(`✅ Arquivo convertido removido: ${video.caminho}`);
    } catch (sshError) {
      console.warn('Erro ao remover arquivo do servidor:', sshError.message);
    }

    // Remover do banco
    await db.execute(
      'DELETE FROM videos WHERE id = ?',
      [videoId]
    );

    res.json({
      success: true,
      message: 'Conversão removida com sucesso'
    });

  } catch (err) {
    console.error('Erro ao remover conversão:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao remover conversão', 
      details: err.message 
    });
  }
});

// POST /api/conversion/batch - Conversão em lote
router.post('/batch', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { video_ids, quality, custom_bitrate, custom_resolution } = req.body;

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Lista de vídeos é obrigatória' 
      });
    }

    const results = [];

    for (const videoId of video_ids) {
      try {
        // Fazer requisição individual para cada vídeo
        const conversionResult = await new Promise((resolve, reject) => {
          const mockReq = {
            user: req.user,
            body: { video_id: videoId, quality, custom_bitrate, custom_resolution }
          };
          
          const mockRes = {
            json: resolve,
            status: () => ({ json: reject })
          };

          // Simular chamada individual
          router.post('/convert', authMiddleware, async (mockReq, mockRes) => {
            // Lógica de conversão individual aqui
          });
        });

        results.push({
          video_id: videoId,
          success: true,
          result: conversionResult
        });
      } catch (error) {
        results.push({
          video_id: videoId,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `${successCount} de ${video_ids.length} conversões iniciadas`,
      results: results
    });

  } catch (err) {
    console.error('Erro na conversão em lote:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro na conversão em lote', 
      details: err.message 
    });
  }
});

module.exports = router;