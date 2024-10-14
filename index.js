const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ID dei canali e nomi dei ruoli
const TICKET_CHANNEL_ID = 'ID_DEL_CANAL_TICKET'; // Sostituisci con l'ID del canale dove inviare il messaggio di apertura ticket
const LOG_CHANNEL_ID = 'ID_DEL_CANAL_LOG'; // Sostituisci con l'ID del canale di log
const STAFF_ROLE_NAME = 'Staff'; // Nome del ruolo per lo staff
const USER_ROLE_NAME = 'Utente'; // Nome del ruolo per gli utenti

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    const channel = client.channels.cache.get(TICKET_CHANNEL_ID);
    if (channel) {
        await sendTicketMessage(channel);
    }
});

async function sendTicketMessage(channel) {
    const embed = new EmbedBuilder()
        .setColor('#00BFFF') // Colore azzurro
        .setTitle('Apertura Ticket')
        .setDescription('Scegli una categoria per il tuo ticket:')
        .setFooter({ text: 'Clicca uno dei pulsanti qui sotto per aprire un ticket.' });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('supporto')
                .setLabel('Supporto')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('generale')
                .setLabel('Generale')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('report')
                .setLabel('Report')
                .setStyle(ButtonStyle.Success),
        );

    await channel.send({ embeds: [embed], components: [row] });
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user } = interaction;
    const member = interaction.guild.members.cache.get(user.id);

    // Controlla se l'utente ha il permesso di aprire un ticket
    if (!member.roles.cache.some((role) => role.name === USER_ROLE_NAME)) {
        const noPermissionEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setDescription('Non hai il permesso di aprire un ticket.');
        return interaction.reply({ embeds: [noPermissionEmbed], ephemeral: true });
    }

    // Crea la categoria se non esiste già
    let category = interaction.guild.channels.cache.find((c) => c.name === customId && c.type === ChannelType.GuildCategory);
    if (!category) {
        category = await interaction.guild.channels.create(customId, { type: ChannelType.GuildCategory });
    }

    // Crea il canale ticket
    const ticketChannel = await interaction.guild.channels.create(`${customId}-ticket-${user.username}`, { parent: category.id });

    // Messaggio di benvenuto
    const welcomeEmbed = new EmbedBuilder()
        .setColor('#00BFFF')
        .setTitle('Benvenuto nel tuo ticket')
        .setDescription('Un membro dello staff ti risponderà a breve. Usa il pulsante qui sotto per chiudere il ticket.')
        .setFooter({ text: 'Puoi chiudere il ticket quando hai finito.' });

    const closeRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('close')
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger),
        );

    await ticketChannel.send({ embeds: [welcomeEmbed], components: [closeRow] });

    // Rispondi all'interazione
    const ticketCreatedEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setDescription(`Ticket creato: ${ticketChannel}`);

    await interaction.reply({ embeds: [ticketCreatedEmbed], ephemeral: true });
});

// Funzione per gestire la chiusura del ticket
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, channel } = interaction;

    if (customId === 'close') {
        await channel.send({ embeds: [new EmbedBuilder().setColor('#00BFFF').setDescription('Per favore, fornisci un motivo per la chiusura del ticket:')] });

        const filter = (m) => m.author.id === user.id;
        const collector = channel.createMessageCollector({ filter, time: 30000 });

        collector.on('collect', async (message) => {
            const closeReason = message.content;

            const closeEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Ticket Chiuso')
                .setDescription(`Motivo di chiusura: ${closeReason}`)
                .setFooter({ text: 'Il ticket sarà chiuso tra 3 secondi.' });

            await channel.send({ embeds: [closeEmbed] });
            collector.stop(); // Ferma il collector
            setTimeout(() => channel.delete(), 3000); // Chiudi il canale dopo 3 secondi

            // Log nel canale di log
            const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Ticket Chiuso')
                    .addFields(
                        { name: 'Ticket Channel', value: channel.name, inline: true },
                        { name: 'Utente', value: user.tag, inline: true },
                        { name: 'Motivo di Chiusura', value: closeReason, inline: true },
                        { name: 'Data di Chiusura', value: new Date().toLocaleString(), inline: true },
                    );

                await logChannel.send({ embeds: [logEmbed] });
            }
        });
    }
});

// Funzione di claim del ticket
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, channel } = interaction;

    if (customId.startsWith('claim-')) {
        const staffRole = interaction.guild.roles.cache.find(role => role.name === STAFF_ROLE_NAME);
        if (!staffRole) {
            return interaction.reply({ content: 'Ruolo staff non trovato.', ephemeral: true });
        }

        const claimedEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('Ticket Claimed')
            .setDescription(`Il ticket è stato assegnato a ${user.tag}.`)
            .setFooter({ text: 'Attendere che uno staff risponda.' });

        await channel.send({ embeds: [claimedEmbed] });

        // Aggiungi il nome dello staffer all'embed
        // Disabilita altri claim
        const claimRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('claimed')
                    .setLabel('Claimato')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
            );

        await channel.send({ components: [claimRow] });

        // Notifica all'utente
        await channel.send({ embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription(`${user.tag}, un membro dello staff ha preso in carico il tuo ticket.`)] });
    }
});

// Tempi di inattività e chiusura automatica
async function inactivityCheck(channel) {
    const timeoutDuration = 48 * 60 * 60 * 1000; // 48 ore
    setTimeout(async () => {
        const messages = await channel.messages.fetch();
        const lastMessage = messages.last();
        const lastTimestamp = lastMessage.createdTimestamp;

        if (Date.now() - lastTimestamp >= timeoutDuration) {
            const inactivityEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setDescription('Ticket chiuso per inattività.');

            await channel.send({ embeds: [inactivityEmbed] });
            await channel.delete();
            // Logica di archiviazione del ticket chiuso
        }
    }, timeoutDuration);
}

// Riapertura dei ticket
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user } = interaction;

    // Logica per riaprire i ticket
    if (customId === 'reopen') {
        const ticketChannel = interaction.channel;
        const reopenEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setDescription('Il tuo ticket è stato riaperto!');

        await ticketChannel.send({ embeds: [reopenEmbed] });
        await ticketChannel.permissionOverwrites.edit(user.id, { VIEW_CHANNEL: true });
    }
});

// Funzione di escalation
async function escalationCheck(channel) {
    const escalationDuration = 24 * 60 * 60 * 1000; // 24 ore
    setTimeout(async () => {
        const messages = await channel.messages.fetch();
        const lastMessage = messages.last();
        const lastTimestamp = lastMessage.createdTimestamp;

        if (Date.now() - lastTimestamp >= escalationDuration) {
            const escalationEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setDescription('Questo ticket è inattivo da 24 ore. Si prega di controllarlo.');

            await channel.send({ embeds: [escalationEmbed] });
        }
    }, escalationDuration);
}

// Avvio del bot
client.login('TOKEN_DEL_BOT'); // Sostituisci con il tuo token
