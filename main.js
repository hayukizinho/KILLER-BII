const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Ok Estou Pronto!'));

client.on('disconnect', () => console.log('Desconectado, logo mais parça..'));

client.on('reconnecting', () => console.log('Reconectando.'));

client.on('message', async msg => { // eslint-disable-line
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if (command === 'ping') {
			 
		let embed = new Discord.RichEmbed()
		.setTitle("PING DO BOT!")
		.setColor("RANDOM")
		.setDescription(`O ping do bot é de ${Math.round(bot.ping)}ms!`)
		.setFooter(`Comando de ping`, bot.user.displayAvatarURL);

		message.channel.send(embed);
	}

	if (command === 'play') {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send('Me desculpe, mas você precisa estar em um canal de voz para tocar música!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send('Não consigo me conectar ao seu canal de voz, verifique se tenho as permissões adequadas!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send('Eu não posso falar neste canal de voz, verifique se eu tenho as permissões adequadas!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
				await handleVideo(video2, msg, voiceChannel, true); // eslint-disable-line no-await-in-loop
			}
			return msg.channel.send(`Playlist: **${playlist.title}** foi adicionada a sua lista!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Seleção de Musica Aleatoria**__

${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}

Escolha uma das músicas de 1-10
					`);
					// eslint-disable-next-line max-depth
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 25000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send('Nenhum valor inserido ou está inválido, cancelando a operação de seleção de vídeo.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Não consegui obter nenhum resultado de pesquisa.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (command === 'skip') {
		if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal de voz');
		if (!serverQueue) return msg.channel.send('Não a nada tocando posso pular pra você');
		serverQueue.connection.dispatcher.end('Skipado com Sucesso');
		return undefined;
	} else if (command === 'stop') {
		if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal de voz!');
		if (!serverQueue) return msg.channel.send('Não tá tocando eu não posso parar pra você');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end('O Comando de parar foi usado!');
		return undefined;
	} else if (command === 'volume') {
		if (!msg.member.voiceChannel) return msg.channel.send('Você não está em um canal de voz!');
		if (!serverQueue) return msg.channel.send('Não está tocando.');
		if (!args[1]) return msg.channel.send(`O Volume atual é: **${serverQueue.volume}**`);
		serverQueue.volume = args[1];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[1] / 5);
		return msg.channel.send(`Ajustar volume para: **${args[1]}**`);
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send('Não a nada tocando.');
		return msg.channel.send(`Tocando: **${serverQueue.songs[0].title}**`);
	} else if (command === 'queue') {
		if (!serverQueue) return msg.channel.send('Não a nada tocando.');
		return msg.channel.send(`
__**Lista de Música:**__

${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}

**Tocando Agora:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ Musica foi pausada.');
		}
		return msg.channel.send('Não a nada tocando.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send('▶ A Musica voltou a ser reproduzida.');
		}
		return msg.channel.send('Não a nada tocando.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Eu não pude entrar no canal de voz: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Eu não pude entrar no canal de voz: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`A Musica: **${song.title}** foi adicionado a lista!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);


	const stream = ytdl(song.url, {filter : 'audioonly'});
	const dispatcher = serverQueue.connection.playStream(stream, song.url);
	dispatcher.on('end', reason => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
    })
    .on('error', error => console.error(error));
dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`Tocando: **${song.title}**`);
}

client.login(TOKEN);