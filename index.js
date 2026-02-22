const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} = require("discord.js")
const fs = require("fs")

const TOKEN = process.env.TOKEN

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
})

const prefix = "."
const embedSessions = new Map()
const scriptPanelSessions = new Map()
const setupSessions = new Map()

const DATA_FILE = "./data.json"

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ scriptButtons: [], permissions: {}, giveaways: {}, warnings: {}, muted: {}, polls: {} }, null, 2))
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
    if (!data.giveaways) data.giveaways = {}
    if (!data.warnings) data.warnings = {}
    if (!data.muted) data.muted = {}
    if (!data.polls) data.polls = {}
    return data
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

function hasPermission(member, command) {
    const data = loadData()
    if (!data.permissions[command]) return true
    return member.roles.cache.some(role => data.permissions[command].includes(role.id))
}

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/)
    if (!match) return null
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 }
    return parseInt(match[1]) * multipliers[match[2]]
}

// =================
// End Poll Function
// =================
async function endPoll(pollId) {
    const data = loadData()
    const poll = data.polls[pollId]
    if (!poll || poll.ended) return

    const pollChannel = await client.channels.fetch(poll.channelId).catch(() => null)
    if (!pollChannel) return

    const msg = await pollChannel.messages.fetch(poll.messageId).catch(() => null)

    const votes = poll.votes || {}
    const options = poll.options || []
    const counts = options.map((_, i) => Object.values(votes).filter(v => v === i).length)
    const total = counts.reduce((a, b) => a + b, 0)

    const maxVotes = Math.max(...counts)
    const winners = options.filter((_, i) => counts[i] === maxVotes && maxVotes > 0)

    const finalDesc = options.map((opt, i) => {
        const count = counts[i]
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10))
        return `**${opt}**\n${bar} ${count} votes (${pct}%)`
    }).join("\n\n")

    if (msg) {
        const endedEmbed = new EmbedBuilder()
            .setTitle(`📊 ${poll.question} — ENDED`)
            .setDescription(finalDesc)
            .setColor("#ff4d6d")
            .setFooter({ text: `Total votes: ${total}` })
            .setTimestamp()

        const disabledRows = msg.components.map(row =>
            new ActionRowBuilder().addComponents(
                row.components.map(btn =>
                    new ButtonBuilder()
                        .setCustomId(btn.customId)
                        .setLabel(btn.label)
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                )
            )
        )
        await msg.edit({ embeds: [endedEmbed], components: disabledRows }).catch(() => null)
    }

    const resultEmbed = new EmbedBuilder()
        .setTitle("📊 Poll Results")
        .setDescription(finalDesc)
        .addFields(
            { name: "❓ Question", value: poll.question, inline: false },
            { name: "👥 Total Votes", value: `${total}`, inline: true },
            { name: "🏆 Winner", value: winners.length > 0 ? winners.join(", ") : "No votes", inline: true }
        )
        .setColor("#ffd700")
        .setTimestamp()

    await pollChannel.send({ embeds: [resultEmbed] })

    data.polls[pollId].ended = true
    saveData(data)
}

// =================
// End Giveaway Function
// =================
async function endGiveaway(giveawayId) {
    const data = loadData()
    const gw = data.giveaways[giveawayId]
    if (!gw || gw.ended) return

    const guild = client.guilds.cache.get(gw.guildId)
    if (!guild) return
    const channel = guild.channels.cache.get(gw.channelId)
    if (!channel) return
    const msg = await channel.messages.fetch(gw.messageId).catch(() => null)
    if (!msg) return

    const entries = gw.entries || []
    const winners = [...entries].sort(() => Math.random() - 0.5).slice(0, Math.min(gw.winnerCount || 1, entries.length))

    gw.ended = true
    gw.winners = winners
    data.giveaways[giveawayId] = gw
    saveData(data)

    const winnerText = winners.length > 0 ? winners.map(id => `<@${id}>`).join(", ") : "No winners (no entries)"
    const endEmbed = new EmbedBuilder()
        .setTitle("🎉 Giveaway Ended!")
        .setDescription(`**Prize:** ${gw.prize}\n\n🏆 **Winner(s):** ${winnerText}`)
        .addFields({ name: "Total Entries", value: `${entries.length}`, inline: true })
        .setColor("#ff4d6d").setTimestamp()

    const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("gw_ended").setLabel(`🎉 Ended - ${entries.length} entries`).setStyle(ButtonStyle.Secondary).setDisabled(true)
    )
    await msg.edit({ embeds: [endEmbed], components: [disabledRow] })
    if (winners.length > 0) await channel.send(`🎊 Congratulations ${winnerText}! You won **${gw.prize}**!`)
    else await channel.send("😔 No one entered the giveaway!")
}

// =================
// Ready Event
// =================
client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`)
    const data = loadData()
    const now = Date.now()

    // Restore Giveaways
    for (const [id, gw] of Object.entries(data.giveaways)) {
        if (gw.ended) continue
        const remaining = gw.endTime - now
        if (remaining <= 0) endGiveaway(id)
        else setTimeout(() => endGiveaway(id), remaining)
    }

    // Restore Polls
    for (const [id, poll] of Object.entries(data.polls)) {
        if (poll.ended) continue
        const remaining = poll.endTime - now
        if (remaining <= 0) endPoll(id)
        else setTimeout(() => endPoll(id), remaining)
    }
})

// =================
// Message Handler
// =================
client.on("messageCreate", async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    try {

        // =================
        // .say
        // =================
        if (command === "say") {
            if (!hasPermission(message.member, "say")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            const text = args.join(" ")
            if (!text) return message.reply("Write a message after the command")
            await message.delete().catch(() => null)
            await message.channel.send(text)
        }

        // =================
        // .embed
        // =================
        if (command === "embed") {
            if (!hasPermission(message.member, "embed")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            const parts = args.join(" ").split("|")
            if (parts.length < 2) return message.reply("Usage: .embed title | description")
            await message.delete().catch(() => null)
            await message.channel.send({ embeds: [new EmbedBuilder().setTitle(parts[0].trim()).setDescription(parts[1].trim()).setColor("#5865F2").setTimestamp()] })
        }

        // =================
        // .embedwithbuttons
        // =================
        if (command === "embedwithbuttons") {
            if (!hasPermission(message.member, "embedwithbuttons")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const sessionData = { userId: message.author.id, channelId: message.channel.id, title: "", description: "", color: "#7c4dff", buttons: [] }
            embedSessions.set(message.author.id, sessionData)
            await showEmbedSettings(message.channel, message.author.id, sessionData)
        }

        // =================
        // .editembed
        // =================
        if (command === "editembed") {
            if (!hasPermission(message.member, "editembed")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            const msgId = args[0]
            if (!msgId) return message.reply("Usage: .editembed MESSAGE_ID")
            await message.delete().catch(() => null)
            const targetMessage = await message.channel.messages.fetch(msgId).catch(() => null)
            if (!targetMessage) return message.channel.send("Message not found")
            if (!targetMessage.embeds.length) return message.channel.send("This message has no embed")

            const filter = m => m.author.id === message.author.id
            const ask1 = await message.channel.send(`<@${message.author.id}> Enter the new title`)
            let collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null)
            if (!collected?.size) return message.channel.send("Timed out")
            const newTitle = collected.first().content
            await ask1.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            const ask2 = await message.channel.send(`<@${message.author.id}> Enter the new description`)
            collected = await message.channel.awaitMessages({ filter, max: 1, time: 60000 }).catch(() => null)
            if (!collected?.size) return message.channel.send("Timed out")
            const newDesc = collected.first().content
            await ask2.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            await targetMessage.edit({ embeds: [new EmbedBuilder().setTitle(newTitle).setDescription(newDesc).setColor("#ff4d6d").setTimestamp()] })
        }

        // =================
        // .getscript
        // =================
        if (command === "getscript") {
            const data = loadData()
            if (!data.scriptButtons?.length) {
                const m = await message.reply("❌ No scripts available yet!")
                return setTimeout(() => m.delete().catch(() => null), 3000)
            }
            const embed = new EmbedBuilder().setTitle("📜 Available Scripts").setDescription("Click a button below to get the script!").setColor("#7c4dff").setTimestamp()
            const rows = []
            for (let i = 0; i < data.scriptButtons.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(
                    data.scriptButtons.slice(i, i + 5).map((btn, idx) =>
                        new ButtonBuilder().setCustomId(`getscript_btn_${i + idx}`).setLabel(btn.label).setStyle(ButtonStyle.Primary)
                    )
                ))
            }
            await message.channel.send({ embeds: [embed], components: rows })
        }

        // =================
        // .poll
        // =================
        if (command === "poll") {
            if (!hasPermission(message.member, "poll")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)

            const triggerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`poll_open_modal_${message.author.id}_${message.channel.id}`)
                    .setLabel("📊 Create Poll")
                    .setStyle(ButtonStyle.Primary)
            )
            const triggerMsg = await message.channel.send({
                content: `<@${message.author.id}> Click to create your poll!`,
                components: [triggerRow]
            })
            setTimeout(() => triggerMsg.delete().catch(() => null), 120000)
        }

        // =================
        // .endpoll (Owner only)
        // =================
        if (command === "endpoll") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const guildPolls = Object.entries(data.polls)
                .filter(([, p]) => p.guildId === message.guild.id && !p.ended)
                .sort(([, a], [, b]) => b.createdAt - a.createdAt)

            if (guildPolls.length === 0) {
                const m = await message.channel.send("❌ No active polls found!")
                return setTimeout(() => m.delete().catch(() => null), 3000)
            }

            const [pollId] = guildPolls[0]
            await endPoll(pollId)
        }

        // =================
        // .ban
        // =================
        if (command === "ban") {
            if (!hasPermission(message.member, "ban")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found! Usage: .ban @user reason")
            const reason = args.slice(1).join(" ") || "No reason provided"
            if (!target.bannable) return message.channel.send("❌ I can't ban this user!")
            await target.ban({ reason })
            const embed = new EmbedBuilder()
                .setTitle("🔨 User Banned")
                .addFields(
                    { name: "User", value: `${target.user.tag}`, inline: true },
                    { name: "Moderator", value: `${message.author.tag}`, inline: true },
                    { name: "Reason", value: reason }
                ).setColor("#ff0000").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .unban
        // =================
        if (command === "unban") {
            if (!hasPermission(message.member, "unban")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const userId = args[0]
            if (!userId) return message.channel.send("❌ Usage: .unban USER_ID")
            await message.guild.members.unban(userId).catch(() => null)
            const embed = new EmbedBuilder()
                .setTitle("✅ User Unbanned")
                .addFields(
                    { name: "User ID", value: userId, inline: true },
                    { name: "Moderator", value: message.author.tag, inline: true }
                ).setColor("#00ff00").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .kick
        // =================
        if (command === "kick") {
            if (!hasPermission(message.member, "kick")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found! Usage: .kick @user reason")
            const reason = args.slice(1).join(" ") || "No reason provided"
            if (!target.kickable) return message.channel.send("❌ I can't kick this user!")
            await target.kick(reason)
            const embed = new EmbedBuilder()
                .setTitle("👢 User Kicked")
                .addFields(
                    { name: "User", value: `${target.user.tag}`, inline: true },
                    { name: "Moderator", value: `${message.author.tag}`, inline: true },
                    { name: "Reason", value: reason }
                ).setColor("#ff8800").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .mute
        // =================
        if (command === "mute") {
            if (!hasPermission(message.member, "mute")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found! Usage: .mute @user duration reason")
            const durationStr = args[1]
            const duration = parseDuration(durationStr)
            const reason = args.slice(duration ? 2 : 1).join(" ") || "No reason provided"
            const timeoutDuration = duration || 10 * 60 * 1000
            await target.timeout(timeoutDuration, reason)

            const data = loadData()
            if (!data.muted[message.guild.id]) data.muted[message.guild.id] = {}
            data.muted[message.guild.id][target.id] = {
                userId: target.id, username: target.user.tag,
                reason, moderator: message.author.tag, mutedAt: Date.now(), duration: timeoutDuration
            }
            saveData(data)

            const embed = new EmbedBuilder()
                .setTitle("🔇 User Muted")
                .addFields(
                    { name: "User", value: `${target.user.tag}`, inline: true },
                    { name: "Moderator", value: `${message.author.tag}`, inline: true },
                    { name: "Duration", value: durationStr || "10m", inline: true },
                    { name: "Reason", value: reason }
                ).setColor("#ffcc00").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .unmute
        // =================
        if (command === "unmute") {
            if (!hasPermission(message.member, "unmute")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found!")
            await target.timeout(null)

            const data = loadData()
            if (data.muted[message.guild.id]) delete data.muted[message.guild.id][target.id]
            saveData(data)

            const embed = new EmbedBuilder()
                .setTitle("🔊 User Unmuted")
                .addFields(
                    { name: "User", value: `${target.user.tag}`, inline: true },
                    { name: "Moderator", value: `${message.author.tag}`, inline: true }
                ).setColor("#00ff00").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .warn
        // =================
        if (command === "warn") {
            if (!hasPermission(message.member, "warn")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found!")
            const reason = args.slice(1).join(" ") || "No reason provided"

            const data = loadData()
            if (!data.warnings[message.guild.id]) data.warnings[message.guild.id] = {}
            if (!data.warnings[message.guild.id][target.id]) data.warnings[message.guild.id][target.id] = []
            data.warnings[message.guild.id][target.id].push({ reason, moderator: message.author.tag, date: new Date().toISOString() })
            saveData(data)

            const embed = new EmbedBuilder()
                .setTitle("⚠️ User Warned")
                .addFields(
                    { name: "User", value: `${target.user.tag}`, inline: true },
                    { name: "Moderator", value: `${message.author.tag}`, inline: true },
                    { name: "Total Warnings", value: `${data.warnings[message.guild.id][target.id].length}`, inline: true },
                    { name: "Reason", value: reason }
                ).setColor("#ffaa00").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .warnings
        // =================
        if (command === "warnings") {
            if (!hasPermission(message.member, "warnings")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null)
            if (!target) return message.channel.send("❌ User not found!")

            const data = loadData()
            const warns = data.warnings[message.guild.id]?.[target.id] || []
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ Warnings for ${target.user.tag}`)
                .setDescription(warns.length === 0 ? "No warnings" : warns.map((w, i) => `**${i + 1}.** ${w.reason}\n> By: ${w.moderator} | ${new Date(w.date).toLocaleDateString()}`).join("\n\n"))
                .addFields({ name: "Total", value: `${warns.length}`, inline: true })
                .setColor("#ffaa00").setTimestamp()
            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .purge
        // =================
        if (command === "purge") {
            if (!hasPermission(message.member, "purge")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const amount = parseInt(args[0])
            if (isNaN(amount) || amount < 1 || amount > 100) return message.channel.send("❌ Provide a number between 1-100!")
            const deleted = await message.channel.bulkDelete(amount, true).catch(() => null)
            const m = await message.channel.send(`✅ Deleted **${deleted?.size || 0}** messages!`)
            setTimeout(() => m.delete().catch(() => null), 3000)
        }

        // =================
        // .showbanned
        // =================
        if (command === "showbanned") {
            if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const bans = await message.guild.bans.fetch().catch(() => null)
            if (!bans || bans.size === 0) {
                return await message.author.send({ embeds: [new EmbedBuilder().setTitle("🔨 Banned Users").setDescription("No banned users").setColor("#ff0000").setTimestamp()] })
            }
            const banList = bans.map(ban => `**${ban.user.tag}** (${ban.user.id})\n> Reason: ${ban.reason || "No reason"}`).join("\n\n")
            for (const chunk of banList.match(/[\s\S]{1,4000}/g) || []) {
                await message.author.send({ embeds: [new EmbedBuilder().setTitle("🔨 Banned Users").setDescription(chunk).setColor("#ff0000").setTimestamp()] })
            }
        }

        // =================
        // .showwarned
        // =================
        if (command === "showwarned") {
            if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const data = loadData()
            const entries = Object.entries(data.warnings[message.guild.id] || {}).filter(([, w]) => w.length > 0)
            if (entries.length === 0) {
                return await message.author.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Warned Users").setDescription("No warned users").setColor("#ffaa00").setTimestamp()] })
            }
            const warnList = entries.map(([uid, warns]) => `<@${uid}> — **${warns.length} warning(s)**\n> Last: ${warns[warns.length - 1].reason}`).join("\n\n")
            for (const chunk of warnList.match(/[\s\S]{1,4000}/g) || []) {
                await message.author.send({ embeds: [new EmbedBuilder().setTitle("⚠️ Warned Users").setDescription(chunk).setColor("#ffaa00").setTimestamp()] })
            }
        }

        // =================
        // .showmuted
        // =================
        if (command === "showmuted") {
            if (message.author.id !== message.guild.ownerId && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const data = loadData()
            const entries = Object.entries(data.muted[message.guild.id] || {})
            if (entries.length === 0) {
                return await message.author.send({ embeds: [new EmbedBuilder().setTitle("🔇 Muted Users").setDescription("No muted users").setColor("#ffcc00").setTimestamp()] })
            }
            const muteList = entries.map(([, m]) => `**${m.username}**\n> Reason: ${m.reason}\n> By: ${m.moderator}`).join("\n\n")
            for (const chunk of muteList.match(/[\s\S]{1,4000}/g) || []) {
                await message.author.send({ embeds: [new EmbedBuilder().setTitle("🔇 Muted Users").setDescription(chunk).setColor("#ffcc00").setTimestamp()] })
            }
        }

        // =================
        // .giveaway
        // =================
        if (command === "giveaway") {
            if (!hasPermission(message.member, "giveaway")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            embedSessions.set(`gw_channel_${message.author.id}`, message.channel.id)
            const triggerRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gw_open_modal_${message.author.id}_${message.channel.id}`).setLabel("🎉 Fill Giveaway Details").setStyle(ButtonStyle.Success)
            )
            const triggerMsg = await message.channel.send({ content: `<@${message.author.id}> Click to fill giveaway details!`, components: [triggerRow] })
            setTimeout(() => triggerMsg.delete().catch(() => null), 120000)
        }

        // =================
        // .rerolllastgiveaway
        // =================
        if (command === "rerolllastgiveaway") {
            if (!hasPermission(message.member, "giveaway")) {
                const m = await message.reply("❌ You don't have permission!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const data = loadData()
            const ended = Object.entries(data.giveaways)
                .filter(([, gw]) => gw.ended && gw.guildId === message.guild.id)
                .sort(([, a], [, b]) => b.endTime - a.endTime)

            if (ended.length === 0) {
                const m = await message.channel.send("❌ No ended giveaways found!")
                return setTimeout(() => m.delete().catch(() => null), 3000)
            }

            const [lastId, lastGw] = ended[0]
            const entries = lastGw.entries || []
            if (entries.length === 0) {
                const m = await message.channel.send("❌ No entries in the last giveaway!")
                return setTimeout(() => m.delete().catch(() => null), 3000)
            }

            const newWinners = [...entries].sort(() => Math.random() - 0.5).slice(0, Math.min(lastGw.winnerCount || 1, entries.length))
            lastGw.winners = newWinners
            data.giveaways[lastId] = lastGw
            saveData(data)

            const winnerText = newWinners.map(id => `<@${id}>`).join(", ")
            await message.channel.send({ embeds: [new EmbedBuilder().setTitle("🔁 Giveaway Rerolled!").setDescription(`**Prize:** ${lastGw.prize}\n\n🏆 **New Winner(s):** ${winnerText}`).setColor("#ffd700").setTimestamp()] })
            await message.channel.send(`🎊 Congratulations ${winnerText}! You won **${lastGw.prize}**!`)
        }

        // =================
        // .setupscriptpanel
        // =================
        if (command === "setupscriptpanel") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const data = loadData()
            const session = { userId: message.author.id, buttons: data.scriptButtons ? [...data.scriptButtons] : [] }
            scriptPanelSessions.set(message.author.id, session)
            await showScriptPanelSettings(message.channel, message.author.id, session)
        }

        // =================
        // .setup
        // =================
        if (command === "setup") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return await message.delete().catch(() => null)
            }
            await message.delete().catch(() => null)
            const data = loadData()
            const session = { userId: message.author.id, permissions: data.permissions ? { ...data.permissions } : {}, selectedCommand: null }
            setupSessions.set(message.author.id, session)
            await showSetupPanel(message.channel, message.author.id, session)
        }

        // =================
        // .help
        // =================
        if (command === "help") {
            await message.delete().catch(() => null)
            const embed = new EmbedBuilder().setTitle("📜 Commands - SpectraX Bot").setDescription("Click any button for details").setColor("#7c4dff")
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("say_btn").setLabel(".say").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("embed_btn").setLabel(".embed").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("embedwithbuttons_btn").setLabel(".embedwithbuttons").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("editembed_btn").setLabel(".editembed").setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId("getscript_help_btn").setLabel(".getscript").setStyle(ButtonStyle.Primary)
            )
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("giveaway_help_btn").setLabel(".giveaway").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("reroll_help_btn").setLabel(".rerolllastgiveaway").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("poll_help_btn").setLabel(".poll").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId("endpoll_help_btn").setLabel(".endpoll").setStyle(ButtonStyle.Success)
            )
            const row3 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("ban_help_btn").setLabel(".ban").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("kick_help_btn").setLabel(".kick").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("mute_help_btn").setLabel(".mute").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("warn_help_btn").setLabel(".warn").setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId("purge_help_btn").setLabel(".purge").setStyle(ButtonStyle.Danger)
            )
            const row4 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId("showbanned_help_btn").setLabel(".showbanned").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("showwarned_help_btn").setLabel(".showwarned").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("showmuted_help_btn").setLabel(".showmuted").setStyle(ButtonStyle.Secondary)
            )
            message.channel.send({ embeds: [embed], components: [row1, row2, row3, row4] })
        }

    } catch (err) {
        console.error(err)
        message.channel.send("Internal error occurred ⚠️")
    }
})

// =================
// Show Functions
// =================
async function showEmbedSettings(channel, userId, data) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Embed Settings").setDescription("Change your embed settings!")
        .addFields(
            { name: "📝 Title", value: data.title || "Not set", inline: true },
            { name: "📄 Description", value: data.description || "Not set", inline: true },
            { name: "🎨 Color", value: data.color, inline: true },
            { name: "🔘 Buttons", value: data.buttons.length > 0 ? `${data.buttons.length} button(s)` : "None", inline: true }
        ).setColor(data.color).setTimestamp()

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`ewb_select_${userId}`).setPlaceholder("Select a setting to change!")
            .addOptions([
                { label: "📝 Set Title", value: "set_title" },
                { label: "📄 Set Description", value: "set_description" },
                { label: "🎨 Set Color", value: "set_color" },
                { label: "🔘 Add Buttons", value: "set_buttons" }
            ])
    )
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ewb_send_${userId}`).setLabel("✅ Send Embed").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ewb_cancel_${userId}`).setLabel("❌ Cancel").setStyle(ButtonStyle.Danger)
    )
    return await channel.send({ embeds: [embed], components: [selectRow, actionRow], content: `🔧 <@${userId}> - Settings:` })
}

async function showScriptPanelSettings(channel, userId, session) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Script Panel Settings")
        .addFields({ name: "📋 Current Buttons", value: session.buttons.length > 0 ? session.buttons.map((b, i) => `**${i + 1}.** ${b.label}`).join("\n") : "No buttons yet" })
        .setColor("#7c4dff").setTimestamp()
    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`ssp_select_${userId}`).setPlaceholder("Select an action")
            .addOptions([
                { label: "➕ Add Button", value: "add_button" },
                { label: "🗑️ Remove Button", value: "remove_button" },
                { label: "💾 Save & Finish", value: "save_panel" }
            ])
    )
    return await channel.send({ embeds: [embed], components: [selectRow], content: `🔧 <@${userId}> - Script Panel:` })
}

async function showSetupPanel(channel, userId, session) {
    const commands = ["say", "embed", "embedwithbuttons", "editembed", "getscript", "giveaway", "ban", "kick", "mute", "unmute", "warn", "warnings", "purge", "poll"]
    const data = loadData()
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Permissions Setup").setDescription("Select a command to set which roles can use it.")
        .addFields(commands.map(cmd => ({
            name: `.${cmd}`,
            value: data.permissions[cmd]?.length > 0 ? data.permissions[cmd].map(id => `<@&${id}>`).join(", ") : "Everyone",
            inline: true
        }))).setColor("#5865F2").setTimestamp()

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`setup_cmd_select_${userId}`).setPlaceholder("Select a command")
            .addOptions(commands.map(cmd => ({ label: `.${cmd}`, value: cmd })))
    )
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`setup_save_${userId}`).setLabel("💾 Save & Close").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`setup_reset_${userId}`).setLabel("🔄 Reset All").setStyle(ButtonStyle.Danger)
    )
    return await channel.send({ embeds: [embed], components: [selectRow, actionRow], content: `🔧 <@${userId}> - Permissions Panel:` })
}

// =================
// Interactions Handler
// =================
client.on("interactionCreate", async interaction => {

    if (interaction.isButton()) {

        // ===== Poll Open Modal =====
        if (interaction.customId.startsWith("poll_open_modal_")) {
            const parts = interaction.customId.split("_")
            const userId = parts[3]
            const channelId = parts[4]
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your button!", ephemeral: true })

            const modal = new ModalBuilder()
                .setCustomId(`poll_modal_${userId}_${channelId}`)
                .setTitle("📊 Create Poll")
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("poll_question").setLabel("Poll Question").setStyle(TextInputStyle.Short).setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("poll_type").setLabel("Type: 'yesno' or 'custom'").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("yesno / custom")
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("poll_options").setLabel("If custom: options separated by | (max 5)").setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder("Option 1|Option 2|Option 3")
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("poll_duration").setLabel("Duration (e.g. 10s, 5m, 2h, 1d)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("5m / 1h / 1d")
                )
            )
            await interaction.message.delete().catch(() => null)
            return await interaction.showModal(modal)
        }

        // ===== Poll Vote =====
        if (interaction.customId.startsWith("poll_vote_")) {
            const parts = interaction.customId.split("_")
            const pollId = parts[2]
            const optionIndex = parseInt(parts[3])

            const data = loadData()
            const poll = data.polls[pollId]
            if (!poll || poll.ended) return interaction.reply({ content: "❌ This poll has ended!", ephemeral: true })

            const userId = interaction.user.id
            const prevVote = poll.votes[userId]

            if (prevVote === optionIndex) {
                delete poll.votes[userId]
                await interaction.reply({ content: "✅ Vote removed!", ephemeral: true })
            } else {
                poll.votes[userId] = optionIndex
                await interaction.reply({ content: "✅ Vote recorded!", ephemeral: true })
            }

            data.polls[pollId] = poll
            saveData(data)

            const options = poll.options
            const counts = options.map((_, i) => Object.values(poll.votes).filter(v => v === i).length)
            const total = counts.reduce((a, b) => a + b, 0)

            const newDesc = options.map((opt, i) => {
                const count = counts[i]
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10))
                return `**${opt}**\n${bar} ${count} votes (${pct}%)`
            }).join("\n\n")

            const updatedEmbed = new EmbedBuilder()
                .setTitle(`📊 ${poll.question}`)
                .setDescription(newDesc)
                .addFields({ name: "⏱️ Ends", value: `<t:${Math.floor(poll.endTime / 1000)}:R>`, inline: true })
                .setColor("#5865F2")
                .setTimestamp()

            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(() => null)
        }

        // ===== Giveaway Open Modal =====
        if (interaction.customId.startsWith("gw_open_modal_")) {
            const parts = interaction.customId.split("_")
            const userId = parts[3]
            const channelId = parts[4]
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your button!", ephemeral: true })

            embedSessions.set(`gw_channel_${userId}`, channelId)
            const modal = new ModalBuilder().setCustomId(`giveaway_modal_${userId}`).setTitle("🎉 Create Giveaway")
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_prize").setLabel("Prize").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_duration").setLabel("Duration (10s / 5m / 2h / 1d)").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_winners").setLabel("Number of Winners").setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_role").setLabel("Required Role ID (empty = everyone)").setStyle(TextInputStyle.Short).setRequired(false)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("gw_description").setLabel("Extra Description (optional)").setStyle(TextInputStyle.Paragraph).setRequired(false))
            )
            await interaction.message.delete().catch(() => null)
            return await interaction.showModal(modal)
        }

        // ===== Giveaway Enter =====
        if (interaction.customId.startsWith("gw_enter_")) {
            const giveawayId = interaction.customId.replace("gw_enter_", "")
            const data = loadData()
            const gw = data.giveaways[giveawayId]
            if (!gw || gw.ended) return interaction.reply({ content: "❌ Giveaway has ended!", ephemeral: true })

            if (gw.requiredRole && !interaction.member.roles.cache.has(gw.requiredRole)) {
                const role = interaction.guild.roles.cache.get(gw.requiredRole)
                return interaction.reply({ content: `❌ You need **${role?.name || "required"}** role to enter!`, ephemeral: true })
            }

            if (!gw.entries) gw.entries = []
            if (gw.entries.includes(interaction.user.id)) {
                gw.entries = gw.entries.filter(id => id !== interaction.user.id)
                data.giveaways[giveawayId] = gw
                saveData(data)
                const msg = await interaction.channel.messages.fetch(gw.messageId).catch(() => null)
                if (msg) await msg.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel(`🎉 Enter Giveaway (${gw.entries.length})`).setStyle(ButtonStyle.Success))] })
                return interaction.reply({ content: "✅ You have **left** the giveaway!", ephemeral: true })
            }

            gw.entries.push(interaction.user.id)
            data.giveaways[giveawayId] = gw
            saveData(data)
            const msg = await interaction.channel.messages.fetch(gw.messageId).catch(() => null)
            if (msg) await msg.edit({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel(`🎉 Enter Giveaway (${gw.entries.length})`).setStyle(ButtonStyle.Success))] })
            return interaction.reply({ content: "🎉 You **entered** the giveaway! Good luck!", ephemeral: true })
        }

        // ===== Help Buttons =====
        const helpMap = {
            "say_btn": "**.say <text>**\n> Sends the message you write",
            "embed_btn": "**.embed <title> | <desc>**\n> Sends an embed",
            "embedwithbuttons_btn": "**.embedwithbuttons**\n> Opens embed builder with buttons",
            "editembed_btn": "**.editembed <ID>**\n> Edits an existing embed",
            "getscript_help_btn": "**.getscript**\n> Shows scripts panel",
            "giveaway_help_btn": "**.giveaway**\n> Creates a giveaway",
            "reroll_help_btn": "**.rerolllastgiveaway**\n> Rerolls last giveaway",
            "poll_help_btn": "**.poll**\n> Creates a poll with timer\n> Types: yesno or custom options",
            "endpoll_help_btn": "**.endpoll**\n> Ends the current active poll (Owner only)",
            "ban_help_btn": "**.ban @user reason**\n> Bans a user",
            "kick_help_btn": "**.kick @user reason**\n> Kicks a user",
            "mute_help_btn": "**.mute @user duration reason**\n> Mutes a user (e.g. 10m)",
            "warn_help_btn": "**.warn @user reason**\n> Warns a user",
            "purge_help_btn": "**.purge <1-100>**\n> Deletes messages",
            "showbanned_help_btn": "**.showbanned**\n> DMs you list of banned users",
            "showwarned_help_btn": "**.showwarned**\n> DMs you list of warned users",
            "showmuted_help_btn": "**.showmuted**\n> DMs you list of muted users"
        }
        if (helpMap[interaction.customId]) {
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle("Command Info").setDescription(helpMap[interaction.customId]).setColor("#7c4dff")],
                ephemeral: true
            })
        }

        // ===== Get Script =====
        if (interaction.customId.startsWith("getscript_btn_")) {
            const index = parseInt(interaction.customId.replace("getscript_btn_", ""))
            const data = loadData()
            const btn = data.scriptButtons[index]
            if (!btn) return interaction.reply({ content: "❌ Script not found!", ephemeral: true })
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle(`📜 ${btn.label}`).setDescription(`\`\`\`lua\n${btn.script}\n\`\`\``).setColor("#7c4dff").setTimestamp()],
                ephemeral: true
            })
        }

        // ===== EWB Send =====
        if (interaction.customId.startsWith("ewb_send_")) {
            const userId = interaction.customId.replace("ewb_send_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired.", ephemeral: true })
            if (!data.title || !data.description) return interaction.reply({ content: "⚠️ Set title and description first!", ephemeral: true })

            const finalEmbed = new EmbedBuilder().setTitle(data.title).setDescription(data.description).setColor(data.color).setTimestamp()
            let components = []
            if (data.buttons.length > 0) {
                components = [new ActionRowBuilder().addComponents(data.buttons.map(btn => new ButtonBuilder().setLabel(btn.label).setStyle(ButtonStyle.Link).setURL(btn.url)))]
            }
            await interaction.channel.send({ embeds: [finalEmbed], components })
            embedSessions.delete(userId)
            await interaction.update({ content: "", embeds: [], components: [] })
        }

        // ===== EWB Cancel =====
        if (interaction.customId.startsWith("ewb_cancel_")) {
            const userId = interaction.customId.replace("ewb_cancel_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            embedSessions.delete(userId)
            await interaction.update({ content: "❌ Cancelled", embeds: [], components: [] })
        }

        // ===== Setup Save =====
        if (interaction.customId.startsWith("setup_save_")) {
            const userId = interaction.customId.replace("setup_save_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            const data = loadData()
            data.permissions = session.permissions
            saveData(data)
            setupSessions.delete(userId)
            await interaction.update({ content: "✅ Permissions saved!", embeds: [], components: [] })
        }

        // ===== Setup Reset =====
        if (interaction.customId.startsWith("setup_reset_")) {
            const userId = interaction.customId.replace("setup_reset_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            session.permissions = {}
            setupSessions.set(userId, session)
            const data = loadData()
            data.permissions = {}
            saveData(data)
            await interaction.update({ content: "🔄 All permissions reset!", embeds: [], components: [] })
        }

        // ===== Setup Clear Command =====
        if (interaction.customId.startsWith("setup_clear_cmd_")) {
            const userId = interaction.customId.replace("setup_clear_cmd_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = setupSessions.get(userId)
            if (!session?.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })
            delete session.permissions[session.selectedCommand]
            setupSessions.set(userId, session)
            return await interaction.update({ content: `✅ **.${session.selectedCommand}** is now for everyone!\nPress **💾 Save & Close**!`, components: [] })
        }
    }

    // ===== Select Menus =====
    if (interaction.isStringSelectMenu()) {

        if (interaction.customId.startsWith("ewb_select_")) {
            const userId = interaction.customId.replace("ewb_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired.", ephemeral: true })
            const selected = interaction.values[0]

            const configs = {
                set_title: { id: `ewb_modal_title_${userId}`, title: "Set Title", fieldId: "title_input", label: "Enter title", style: TextInputStyle.Short, val: data.title },
                set_description: { id: `ewb_modal_desc_${userId}`, title: "Set Description", fieldId: "desc_input", label: "Enter description", style: TextInputStyle.Paragraph, val: data.description },
                set_color: { id: `ewb_modal_color_${userId}`, title: "Set Color", fieldId: "color_input", label: "Color code (e.g. #ff0000)", style: TextInputStyle.Short, val: data.color },
                set_buttons: { id: `ewb_modal_buttons_${userId}`, title: "Add Buttons", fieldId: "buttons_input", label: "label|url per line (max 5)", style: TextInputStyle.Paragraph, val: "" }
            }
            const cfg = configs[selected]
            if (!cfg) return
            const modal = new ModalBuilder().setCustomId(cfg.id).setTitle(cfg.title)
            const input = new TextInputBuilder().setCustomId(cfg.fieldId).setLabel(cfg.label).setStyle(cfg.style).setRequired(selected !== "set_buttons")
            if (cfg.val) input.setValue(cfg.val)
            modal.addComponents(new ActionRowBuilder().addComponents(input))
            return await interaction.showModal(modal)
        }

        if (interaction.customId.startsWith("ssp_select_")) {
            const userId = interaction.customId.replace("ssp_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            const selected = interaction.values[0]

            if (selected === "add_button") {
                const modal = new ModalBuilder().setCustomId(`ssp_modal_add_${userId}`).setTitle("Add Script Button")
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("btn_label").setLabel("Button Label").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("btn_script").setLabel("Script Content").setStyle(TextInputStyle.Paragraph).setRequired(true))
                )
                return await interaction.showModal(modal)
            }
            if (selected === "remove_button") {
                if (session.buttons.length === 0) return interaction.reply({ content: "❌ No buttons!", ephemeral: true })
                const removeSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId(`ssp_remove_select_${userId}`).setPlaceholder("Select button to remove")
                        .addOptions(session.buttons.map((btn, i) => ({ label: btn.label, value: `${i}` })))
                )
                return await interaction.reply({ content: "Select button to remove:", components: [removeSelect], ephemeral: true })
            }
            if (selected === "save_panel") {
                const data = loadData()
                data.scriptButtons = session.buttons
                saveData(data)
                scriptPanelSessions.delete(userId)
                return await interaction.update({ content: "✅ Script panel saved!", embeds: [], components: [] })
            }
        }

        if (interaction.customId.startsWith("ssp_remove_select_")) {
            const userId = interaction.customId.replace("ssp_remove_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            const index = parseInt(interaction.values[0])
            const removed = session.buttons.splice(index, 1)
            scriptPanelSessions.set(userId, session)
            return await interaction.update({ content: `✅ Removed: **${removed[0].label}**`, components: [] })
        }

        if (interaction.customId.startsWith("setup_cmd_select_")) {
            const userId = interaction.customId.replace("setup_cmd_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            session.selectedCommand = interaction.values[0]
            setupSessions.set(userId, session)

            const roles = interaction.guild.roles.cache
                .filter(r => !r.managed && r.id !== interaction.guild.id)
                .first(25).map(r => ({ label: r.name, value: r.id }))

            if (roles.length === 0) return interaction.reply({ content: "❌ No roles found!", ephemeral: true })

            const roleSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(`setup_role_select_${userId}`)
                    .setPlaceholder(`Roles for .${session.selectedCommand}`)
                    .setMinValues(1).setMaxValues(Math.min(roles.length, 25))
                    .addOptions(roles)
            )
            const clearRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`setup_clear_cmd_${userId}`).setLabel("🔓 Allow Everyone").setStyle(ButtonStyle.Secondary)
            )
            return await interaction.reply({ content: `Select roles for **.${session.selectedCommand}**:`, components: [roleSelect, clearRow], ephemeral: true })
        }

        if (interaction.customId.startsWith("setup_role_select_")) {
            const userId = interaction.customId.replace("setup_role_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = setupSessions.get(userId)
            if (!session?.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })
            session.permissions[session.selectedCommand] = interaction.values
            setupSessions.set(userId, session)
            const roleNames = interaction.values.map(id => `<@&${id}>`).join(", ")
            return await interaction.update({ content: `✅ Roles for **.${session.selectedCommand}**: ${roleNames}\nPress **💾 Save & Close**!`, components: [] })
        }
    }

    // ===== Modal Submits =====
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId

        if (customId.startsWith("ewb_modal_")) {
            const parts = customId.split("_")
            const type = parts[2]
            const userId = parts.slice(3).join("_")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired.", ephemeral: true })

            if (type === "title") { data.title = interaction.fields.getTextInputValue("title_input"); embedSessions.set(userId, data); await interaction.reply({ content: `✅ Title: **${data.title}**`, ephemeral: true }) }
            if (type === "desc") { data.description = interaction.fields.getTextInputValue("desc_input"); embedSessions.set(userId, data); await interaction.reply({ content: "✅ Description updated!", ephemeral: true }) }
            if (type === "color") {
                const color = interaction.fields.getTextInputValue("color_input").trim()
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return interaction.reply({ content: "⚠️ Invalid color!", ephemeral: true })
                data.color = color; embedSessions.set(userId, data); await interaction.reply({ content: `✅ Color: **${color}**`, ephemeral: true })
            }
            if (type === "buttons") {
                const buttons = interaction.fields.getTextInputValue("buttons_input").split("\n")
                    .filter(l => l.includes("|")).slice(0, 5)
                    .map(line => { const [label, url] = line.split("|").map(s => s.trim()); return { label, url } })
                data.buttons = buttons; embedSessions.set(userId, data); await interaction.reply({ content: `✅ ${buttons.length} button(s) added!`, ephemeral: true })
            }
        }

        if (customId.startsWith("ssp_modal_add_")) {
            const userId = customId.replace("ssp_modal_add_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your menu!", ephemeral: true })
            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })
            if (session.buttons.length >= 25) return interaction.reply({ content: "❌ Max 25 buttons!", ephemeral: true })
            const label = interaction.fields.getTextInputValue("btn_label")
            const script = interaction.fields.getTextInputValue("btn_script")
            session.buttons.push({ label, script })
            scriptPanelSessions.set(userId, session)
            await interaction.reply({ content: `✅ Button **${label}** added! Select **Save & Finish** when done.`, ephemeral: true })
        }

        // ===== Poll Modal =====
        if (customId.startsWith("poll_modal_")) {
            const parts = customId.split("_")
            const userId = parts[2]
            const channelId = parts[3]
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your modal!", ephemeral: true })

            const question = interaction.fields.getTextInputValue("poll_question")
            const type = interaction.fields.getTextInputValue("poll_type").toLowerCase().trim()
            const optionsRaw = interaction.fields.getTextInputValue("poll_options")
            const durationStr = interaction.fields.getTextInputValue("poll_duration")

            const duration = parseDuration(durationStr)
            if (!duration) return interaction.reply({ content: "❌ Invalid duration! Use: 10s, 5m, 2h, 1d", ephemeral: true })

            let options = []
            if (type === "yesno") {
                options = ["✅ Yes", "❌ No"]
            } else if (type === "custom") {
                options = optionsRaw.split("|").map(o => o.trim()).filter(Boolean).slice(0, 5)
                if (options.length < 2) return interaction.reply({ content: "❌ Provide at least 2 options separated by |", ephemeral: true })
            } else {
                return interaction.reply({ content: "❌ Type must be 'yesno' or 'custom'", ephemeral: true })
            }

            const channel = interaction.guild.channels.cache.get(channelId)
            if (!channel) return interaction.reply({ content: "❌ Channel not found!", ephemeral: true })

            const pollId = `${interaction.guild.id}_${Date.now()}`
            const endTime = Date.now() + duration

            const desc = options.map(opt => `**${opt}**\n${"░".repeat(10)} 0 votes (0%)`).join("\n\n")
            const pollEmbed = new EmbedBuilder()
                .setTitle(`📊 ${question}`)
                .setDescription(desc)
                .addFields({ name: "⏱️ Ends", value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true })
                .setColor("#5865F2")
                .setTimestamp()

            const rows = []
            for (let i = 0; i < options.length; i += 5) {
                rows.push(new ActionRowBuilder().addComponents(
                    options.slice(i, i + 5).map((opt, idx) =>
                        new ButtonBuilder()
                            .setCustomId(`poll_vote_${pollId}_${i + idx}`)
                            .setLabel(opt)
                            .setStyle(ButtonStyle.Primary)
                    )
                ))
            }

            const pollMsg = await channel.send({ embeds: [pollEmbed], components: rows })

            const data = loadData()
            data.polls[pollId] = {
                guildId: interaction.guild.id,
                channelId: channel.id,
                messageId: pollMsg.id,
                question,
                options,
                votes: {},
                endTime,
                createdAt: Date.now(),
                ended: false
            }
            saveData(data)

            setTimeout(() => endPoll(pollId), duration)
            await interaction.reply({ content: `✅ Poll created in <#${channelId}>!`, ephemeral: true })
        }

        // ===== Giveaway Modal =====
        if (customId.startsWith("giveaway_modal_")) {
            const userId = customId.replace("giveaway_modal_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "Not your modal!", ephemeral: true })

            const channelId = embedSessions.get(`gw_channel_${userId}`)
            const channel = interaction.guild.channels.cache.get(channelId)
            if (!channel) return interaction.reply({ content: "❌ Channel not found!", ephemeral: true })

            const prize = interaction.fields.getTextInputValue("gw_prize")
            const durationStr = interaction.fields.getTextInputValue("gw_duration")
            const winnersStr = interaction.fields.getTextInputValue("gw_winners")
            const roleId = interaction.fields.getTextInputValue("gw_role").trim()
            const description = interaction.fields.getTextInputValue("gw_description").trim()

            const duration = parseDuration(durationStr)
            if (!duration) return interaction.reply({ content: "❌ Invalid duration!", ephemeral: true })
            const winnerCount = parseInt(winnersStr)
            if (isNaN(winnerCount) || winnerCount < 1) return interaction.reply({ content: "❌ Invalid winner count!", ephemeral: true })

            const endTime = Date.now() + duration
            const giveawayId = `${interaction.guild.id}_${Date.now()}`

            const fields = [
                { name: "⏱️ Ends", value: `<t:${Math.floor(endTime / 1000)}:R>`, inline: true },
                { name: "🏆 Winners", value: `${winnerCount}`, inline: true },
                { name: "👥 Entries", value: "0", inline: true },
                { name: "🎟️ Required Role", value: roleId ? `<@&${roleId}>` : "None", inline: true },
                { name: "🎯 Hosted by", value: `<@${userId}>`, inline: true }
            ]
            if (description) fields.push({ name: "📝 Info", value: description })

            const gwEmbed = new EmbedBuilder()
                .setTitle(`🎉 GIVEAWAY - ${prize}`)
                .setDescription("Click the button below to enter!")
                .addFields(fields).setColor("#ffd700").setTimestamp(endTime)

            const enterRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`gw_enter_${giveawayId}`).setLabel("🎉 Enter Giveaway (0)").setStyle(ButtonStyle.Success)
            )

            const gwMsg = await channel.send({ embeds: [gwEmbed], components: [enterRow] })
            const data = loadData()
            data.giveaways[giveawayId] = {
                guildId: interaction.guild.id, channelId: channel.id, messageId: gwMsg.id,
                prize, duration, endTime, winnerCount, requiredRole: roleId || null,
                entries: [], ended: false, winners: []
            }
            saveData(data)
            embedSessions.delete(`gw_channel_${userId}`)
            setTimeout(() => endGiveaway(giveawayId), duration)
            await interaction.reply({ content: `✅ Giveaway created in <#${channel.id}>!`, ephemeral: true })
        }
    }
})

client.login(TOKEN)
