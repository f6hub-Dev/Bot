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
    TextInputStyle
} = require("discord.js")
const fs = require("fs")

const TOKEN = process.env.TOKEN

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
})

const prefix = "."
const embedSessions = new Map()
const scriptPanelSessions = new Map()
const setupSessions = new Map()

// =================
// Load/Save JSON Data
// =================
const DATA_FILE = "./data.json"

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ scriptButtons: [], permissions: {} }, null, 2))
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
}

// =================
// Permission Check
// =================
function hasPermission(member, command) {
    const data = loadData()
    if (!data.permissions[command]) return true // لو مفيش إعداد، الكل يقدر يستخدمه
    const allowedRoles = data.permissions[command]
    return member.roles.cache.some(role => allowedRoles.includes(role.id))
}

client.on("messageCreate", async message => {
    if (message.author.bot) return
    if (!message.content.startsWith(prefix)) return

    const args = message.content.slice(prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const filter = m => m.author.id === message.author.id

    try {

        // =================
        // .say
        // =================
        if (command === "say") {
            if (!hasPermission(message.member, "say")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
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
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            const fullText = args.join(" ")
            const parts = fullText.split("|")
            if (parts.length < 2) return message.reply("Usage:\n.embed title | description")
            await message.delete().catch(() => null)

            const title = parts[0].trim()
            const description = parts[1].trim()

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor("#5865F2")
                .setTimestamp()

            await message.channel.send({ embeds: [embed] })
        }

        // =================
        // .embedwithbuttons
        // =================
        if (command === "embedwithbuttons") {
            if (!hasPermission(message.member, "embedwithbuttons")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)
            const sessionData = {
                userId: message.author.id,
                channelId: message.channel.id,
                title: "",
                description: "",
                color: "#7c4dff",
                buttons: []
            }
            embedSessions.set(message.author.id, sessionData)
            await showEmbedSettings(message.channel, message.author.id, sessionData)
        }

        // =================
        // .editembed
        // =================
        if (command === "editembed") {
            if (!hasPermission(message.member, "editembed")) {
                const m = await message.reply("❌ You don't have permission to use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            const msgId = args[0]
            if (!msgId) return message.reply("Usage: .editembed MESSAGE_ID")
            await message.delete().catch(() => null)

            const targetMessage = await message.channel.messages.fetch(msgId).catch(() => null)
            if (!targetMessage) return message.channel.send("Message not found or an error occurred")
            if (!targetMessage.embeds.length) return message.channel.send("This message has no embed")

            const filter2 = m => m.author.id === message.author.id

            const ask1 = await message.channel.send(`<@${message.author.id}> Enter the new title`)
            let collected = await message.channel.awaitMessages({ filter: filter2, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.channel.send("Timed out")
            const newTitle = collected.first().content
            await ask1.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            const ask2 = await message.channel.send(`<@${message.author.id}> Enter the new description`)
            collected = await message.channel.awaitMessages({ filter: filter2, max: 1, time: 60000 }).catch(() => null)
            if (!collected || !collected.size) return message.channel.send("Timed out")
            const newDesc = collected.first().content
            await ask2.delete().catch(() => null)
            await collected.first().delete().catch(() => null)

            const newEmbed = new EmbedBuilder()
                .setTitle(newTitle)
                .setDescription(newDesc)
                .setColor("#ff4d6d")
                .setTimestamp()

            await targetMessage.edit({ embeds: [newEmbed] })
        }

        // =================
        // .getscript
        // =================
        if (command === "getscript") {
            const data = loadData()

            if (!data.scriptButtons || data.scriptButtons.length === 0) {
                const m = await message.reply("❌ No scripts available yet!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                return
            }

            const embed = new EmbedBuilder()
                .setTitle("📜 Available Scripts")
                .setDescription("Click a button below to get the script!")
                .setColor("#7c4dff")
                .setTimestamp()

            // تقسيم الأزرار على rows (كل row فيها 5 بحد أقصى)
            const rows = []
            for (let i = 0; i < data.scriptButtons.length; i += 5) {
                const chunk = data.scriptButtons.slice(i, i + 5)
                const row = new ActionRowBuilder().addComponents(
                    chunk.map((btn, idx) =>
                        new ButtonBuilder()
                            .setCustomId(`getscript_btn_${i + idx}`)
                            .setLabel(btn.label)
                            .setStyle(ButtonStyle.Primary)
                    )
                )
                rows.push(row)
            }

            await message.channel.send({ embeds: [embed], components: rows })
            // مش بنحذف .getscript زي ما طلبت
        }

        // =================
        // .setupscriptpanel (Owner only)
        // =================
        if (command === "setupscriptpanel") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const session = {
                userId: message.author.id,
                buttons: data.scriptButtons ? [...data.scriptButtons] : []
            }
            scriptPanelSessions.set(message.author.id, session)

            await showScriptPanelSettings(message.channel, message.author.id, session)
        }

        // =================
        // .setup (Owner only)
        // =================
        if (command === "setup") {
            if (message.author.id !== message.guild.ownerId) {
                const m = await message.reply("❌ Only the server owner can use this command!")
                setTimeout(() => m.delete().catch(() => null), 3000)
                await message.delete().catch(() => null)
                return
            }
            await message.delete().catch(() => null)

            const data = loadData()
            const session = {
                userId: message.author.id,
                permissions: data.permissions ? { ...data.permissions } : {},
                selectedCommand: null
            }
            setupSessions.set(message.author.id, session)

            await showSetupPanel(message.channel, message.author.id, session)
        }

        // =================
        // .help
        // =================
        if (command === "help") {
            await message.delete().catch(() => null)
            const embed = new EmbedBuilder()
                .setTitle("📜 Commands List - SpectraX Bot")
                .setDescription("Click any button to see command details")
                .setColor("#7c4dff")

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId("say_btn").setLabel(".say").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embed_btn").setLabel(".embed").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("embedwithbuttons_btn").setLabel(".embedwithbuttons").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("editembed_btn").setLabel(".editembed").setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId("getscript_help_btn").setLabel(".getscript").setStyle(ButtonStyle.Primary)
                )

            message.channel.send({ embeds: [embed], components: [row] })
        }

    } catch (err) {
        console.error(err)
        message.channel.send("Internal error occurred ⚠️")
    }
})

// =================
// Show Script Panel Settings
// =================
async function showScriptPanelSettings(channel, userId, session) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Script Panel Settings")
        .setDescription("Manage the buttons that appear in `.getscript`")
        .addFields({
            name: "📋 Current Buttons",
            value: session.buttons.length > 0
                ? session.buttons.map((b, i) => `**${i + 1}.** ${b.label}`).join("\n")
                : "No buttons yet"
        })
        .setColor("#7c4dff")
        .setTimestamp()

    const selectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`ssp_select_${userId}`)
                .setPlaceholder("Select an action")
                .addOptions([
                    { label: "➕ Add Button", description: "Add a new script button", value: "add_button" },
                    { label: "🗑️ Remove Button", description: "Remove an existing button", value: "remove_button" },
                    { label: "💾 Save & Finish", description: "Save all changes", value: "save_panel" }
                ])
        )

    return await channel.send({
        embeds: [embed],
        components: [selectRow],
        content: `🔧 <@${userId}> - Script Panel Settings:`
    })
}

// =================
// Show Setup Panel
// =================
async function showSetupPanel(channel, userId, session) {
    const commands = ["say", "embed", "embedwithbuttons", "editembed", "getscript"]
    const data = loadData()

    const embed = new EmbedBuilder()
        .setTitle("⚙️ Permissions Setup")
        .setDescription("Select a command to set which roles can use it.\nIf no roles are set, everyone can use it.")
        .addFields(
            commands.map(cmd => ({
                name: `.${cmd}`,
                value: data.permissions[cmd] && data.permissions[cmd].length > 0
                    ? data.permissions[cmd].map(id => `<@&${id}>`).join(", ")
                    : "Everyone",
                inline: true
            }))
        )
        .setColor("#5865F2")
        .setTimestamp()

    const selectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`setup_cmd_select_${userId}`)
                .setPlaceholder("Select a command to configure")
                .addOptions(
                    commands.map(cmd => ({
                        label: `.${cmd}`,
                        description: `Set roles for .${cmd}`,
                        value: cmd
                    }))
                )
        )

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`setup_save_${userId}`)
                .setLabel("💾 Save & Close")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`setup_reset_${userId}`)
                .setLabel("🔄 Reset All Permissions")
                .setStyle(ButtonStyle.Danger)
        )

    return await channel.send({
        embeds: [embed],
        components: [selectRow, actionRow],
        content: `🔧 <@${userId}> - Permissions Setup Panel:`
    })
}

// =================
// Show Embed Settings
// =================
async function showEmbedSettings(channel, userId, data) {
    const embed = new EmbedBuilder()
        .setTitle("⚙️ Embed Settings")
        .setDescription("Change your embed settings from here!")
        .addFields(
            { name: "📝 Title", value: data.title || "Not set", inline: true },
            { name: "📄 Description", value: data.description || "Not set", inline: true },
            { name: "🎨 Color", value: data.color, inline: true },
            { name: "🔘 Buttons", value: data.buttons.length > 0 ? `${data.buttons.length} button(s)` : "None", inline: true }
        )
        .setColor(data.color)
        .setTimestamp()

    const selectRow = new ActionRowBuilder()
        .addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`ewb_select_${userId}`)
                .setPlaceholder("Select a setting to change!")
                .addOptions([
                    { label: "📝 Set Title", description: "Set the embed title", value: "set_title" },
                    { label: "📄 Set Description", description: "Set the embed description", value: "set_description" },
                    { label: "🎨 Set Color", description: "Set the embed color", value: "set_color" },
                    { label: "🔘 Add Buttons", description: "Add link buttons to the embed", value: "set_buttons" }
                ])
        )

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`ewb_send_${userId}`)
                .setLabel("✅ Send Embed")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`ewb_cancel_${userId}`)
                .setLabel("❌ Cancel")
                .setStyle(ButtonStyle.Danger)
        )

    return await channel.send({
        embeds: [embed],
        components: [selectRow, actionRow],
        content: `🔧 <@${userId}> - Select a setting to change:`
    })
}

// =================
// Interactions Handler
// =================
client.on("interactionCreate", async interaction => {

    // ===== Help Buttons =====
    if (interaction.isButton()) {
        const helpButtons = ["say_btn", "embed_btn", "embedwithbuttons_btn", "editembed_btn", "getscript_help_btn"]
        if (helpButtons.includes(interaction.customId)) {
            let desc = ""
            switch (interaction.customId) {
                case "say_btn": desc = "**.say <text>**\n> Sends the message you write"; break
                case "embed_btn": desc = "**.embed <title> | <description>**\n> Sends an embed you create"; break
                case "embedwithbuttons_btn": desc = "**.embedwithbuttons**\n> Opens a settings menu to build your embed with buttons"; break
                case "editembed_btn": desc = "**.editembed <MESSAGE_ID>**\n> Edits an existing embed"; break
                case "getscript_help_btn": desc = "**.getscript**\n> Shows available scripts panel with buttons to get each script"; break
            }
            return await interaction.reply({
                embeds: [new EmbedBuilder().setTitle("Command Info").setDescription(desc).setColor("#7c4dff")],
                ephemeral: true
            })
        }

        // ===== Get Script Buttons =====
        if (interaction.customId.startsWith("getscript_btn_")) {
            const index = parseInt(interaction.customId.replace("getscript_btn_", ""))
            const data = loadData()
            const btn = data.scriptButtons[index]
            if (!btn) return interaction.reply({ content: "❌ Script not found!", ephemeral: true })

            const embed = new EmbedBuilder()
                .setTitle(`📜 ${btn.label}`)
                .setDescription(`\`\`\`lua\n${btn.script}\n\`\`\``)
                .setColor("#7c4dff")
                .setTimestamp()

            return await interaction.reply({ embeds: [embed], ephemeral: true })
        }

        // ===== EWB Send =====
        if (interaction.customId.startsWith("ewb_send_")) {
            const userId = interaction.customId.replace("ewb_send_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })
            if (!data.title || !data.description) return interaction.reply({ content: "⚠️ You must set a title and description first!", ephemeral: true })

            const finalEmbed = new EmbedBuilder()
                .setTitle(data.title)
                .setDescription(data.description)
                .setColor(data.color)
                .setTimestamp()

            let components = []
            if (data.buttons.length > 0) {
                const btnRow = new ActionRowBuilder().addComponents(
                    data.buttons.map(btn => new ButtonBuilder().setLabel(btn.label).setStyle(ButtonStyle.Link).setURL(btn.url))
                )
                components = [btnRow]
            }

            await interaction.channel.send({ embeds: [finalEmbed], components })
            embedSessions.delete(userId)
            await interaction.update({ content: "", embeds: [], components: [] })
        }

        // ===== EWB Cancel =====
        if (interaction.customId.startsWith("ewb_cancel_")) {
            const userId = interaction.customId.replace("ewb_cancel_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })
            embedSessions.delete(userId)
            await interaction.update({ content: "❌ Cancelled", embeds: [], components: [] })
        }

        // ===== Setup Save =====
        if (interaction.customId.startsWith("setup_save_")) {
            const userId = interaction.customId.replace("setup_save_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const data = loadData()
            data.permissions = session.permissions
            saveData(data)
            setupSessions.delete(userId)

            await interaction.update({ content: "✅ Permissions saved successfully!", embeds: [], components: [] })
        }

        // ===== Setup Reset =====
        if (interaction.customId.startsWith("setup_reset_")) {
            const userId = interaction.customId.replace("setup_reset_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            session.permissions = {}
            setupSessions.set(userId, session)

            const data = loadData()
            data.permissions = {}
            saveData(data)

            await interaction.update({ content: "🔄 All permissions have been reset! Everyone can use all commands now.", embeds: [], components: [] })
        }
    }

    // ===== Select Menus =====
    if (interaction.isStringSelectMenu()) {

        // ===== EWB Select =====
        if (interaction.customId.startsWith("ewb_select_")) {
            const userId = interaction.customId.replace("ewb_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })

            const selected = interaction.values[0]

            if (selected === "set_title") {
                const modal = new ModalBuilder().setCustomId(`ewb_modal_title_${userId}`).setTitle("Set Title")
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("title_input").setLabel("Enter the embed title").setStyle(TextInputStyle.Short).setRequired(true).setValue(data.title || "")
                ))
                return await interaction.showModal(modal)
            }

            if (selected === "set_description") {
                const modal = new ModalBuilder().setCustomId(`ewb_modal_desc_${userId}`).setTitle("Set Description")
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("desc_input").setLabel("Enter the embed description").setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(data.description || "")
                ))
                return await interaction.showModal(modal)
            }

            if (selected === "set_color") {
                const modal = new ModalBuilder().setCustomId(`ewb_modal_color_${userId}`).setTitle("Set Color")
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("color_input").setLabel("Enter color code (e.g. #ff0000)").setStyle(TextInputStyle.Short).setRequired(true).setValue(data.color)
                ))
                return await interaction.showModal(modal)
            }

            if (selected === "set_buttons") {
                const modal = new ModalBuilder().setCustomId(`ewb_modal_buttons_${userId}`).setTitle("Add Buttons")
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("buttons_input").setLabel("Enter buttons (label|url), one per line").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder("Button 1|https://example.com\nButton 2|https://example2.com")
                ))
                return await interaction.showModal(modal)
            }
        }

        // ===== Script Panel Select =====
        if (interaction.customId.startsWith("ssp_select_")) {
            const userId = interaction.customId.replace("ssp_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selected = interaction.values[0]

            if (selected === "add_button") {
                const modal = new ModalBuilder().setCustomId(`ssp_modal_add_${userId}`).setTitle("Add Script Button")
                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId("btn_label").setLabel("Button Label (name shown on button)").setStyle(TextInputStyle.Short).setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId("btn_script").setLabel("Script (loadstring content)").setStyle(TextInputStyle.Paragraph).setRequired(true)
                    )
                )
                return await interaction.showModal(modal)
            }

            if (selected === "remove_button") {
                if (session.buttons.length === 0) return interaction.reply({ content: "❌ No buttons to remove!", ephemeral: true })

                const removeSelect = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`ssp_remove_select_${userId}`)
                        .setPlaceholder("Select button to remove")
                        .addOptions(
                            session.buttons.map((btn, i) => ({
                                label: btn.label,
                                value: `${i}`
                            }))
                        )
                )
                return await interaction.reply({ content: "Select which button to remove:", components: [removeSelect], ephemeral: true })
            }

            if (selected === "save_panel") {
                const data = loadData()
                data.scriptButtons = session.buttons
                saveData(data)
                scriptPanelSessions.delete(userId)
                return await interaction.update({ content: "✅ Script panel saved successfully!", embeds: [], components: [] })
            }
        }

        // ===== Script Panel Remove Select =====
        if (interaction.customId.startsWith("ssp_remove_select_")) {
            const userId = interaction.customId.replace("ssp_remove_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const index = parseInt(interaction.values[0])
            const removed = session.buttons.splice(index, 1)
            scriptPanelSessions.set(userId, session)

            return await interaction.update({ content: `✅ Removed button: **${removed[0].label}**`, components: [] })
        }

        // ===== Setup Command Select =====
        if (interaction.customId.startsWith("setup_cmd_select_")) {
            const userId = interaction.customId.replace("setup_cmd_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selectedCmd = interaction.values[0]
            session.selectedCommand = selectedCmd
            setupSessions.set(userId, session)

            // عرض role select menu
            const guild = interaction.guild
            const roles = guild.roles.cache
                .filter(r => !r.managed && r.id !== guild.id)
                .first(25)
                .map(r => ({ label: r.name, value: r.id }))

            if (roles.length === 0) return interaction.reply({ content: "❌ No roles found in this server!", ephemeral: true })

            const roleSelect = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`setup_role_select_${userId}`)
                    .setPlaceholder(`Select roles for .${selectedCmd} (can select multiple)`)
                    .setMinValues(1)
                    .setMaxValues(Math.min(roles.length, 25))
                    .addOptions(roles)
            )

            const clearRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`setup_clear_cmd_${userId}`)
                    .setLabel(`🔓 Allow Everyone for .${selectedCmd}`)
                    .setStyle(ButtonStyle.Secondary)
            )

            return await interaction.reply({
                content: `Select roles that can use **.${selectedCmd}**:`,
                components: [roleSelect, clearRow],
                ephemeral: true
            })
        }

        // ===== Setup Role Select =====
        if (interaction.customId.startsWith("setup_role_select_")) {
            const userId = interaction.customId.replace("setup_role_select_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = setupSessions.get(userId)
            if (!session || !session.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const selectedRoles = interaction.values
            session.permissions[session.selectedCommand] = selectedRoles
            setupSessions.set(userId, session)

            const roleNames = selectedRoles.map(id => `<@&${id}>`).join(", ")
            return await interaction.update({
                content: `✅ Set roles for **.${session.selectedCommand}**: ${roleNames}\n\nDon't forget to press **💾 Save & Close** in the main panel!`,
                components: []
            })
        }
    }

    // ===== Setup Clear Command Button =====
    if (interaction.isButton() && interaction.customId.startsWith("setup_clear_cmd_")) {
        const userId = interaction.customId.replace("setup_clear_cmd_", "")
        if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

        const session = setupSessions.get(userId)
        if (!session || !session.selectedCommand) return interaction.reply({ content: "Session expired.", ephemeral: true })

        delete session.permissions[session.selectedCommand]
        setupSessions.set(userId, session)

        return await interaction.update({
            content: `✅ **.${session.selectedCommand}** is now accessible by **everyone**!\n\nDon't forget to press **💾 Save & Close** in the main panel!`,
            components: []
        })
    }

    // ===== Modal Submits =====
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId

        // EWB Modals
        if (customId.startsWith("ewb_modal_")) {
            const parts = customId.split("_")
            const type = parts[2]
            const userId = parts.slice(3).join("_")

            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const data = embedSessions.get(userId)
            if (!data) return interaction.reply({ content: "Session expired, start again.", ephemeral: true })

            if (type === "title") {
                data.title = interaction.fields.getTextInputValue("title_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Title updated: **${data.title}**`, ephemeral: true })
            }
            if (type === "desc") {
                data.description = interaction.fields.getTextInputValue("desc_input")
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Description updated!`, ephemeral: true })
            }
            if (type === "color") {
                const color = interaction.fields.getTextInputValue("color_input").trim()
                if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return interaction.reply({ content: "⚠️ Invalid color! Use hex format like #ff0000", ephemeral: true })
                data.color = color
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Color updated: **${data.color}**`, ephemeral: true })
            }
            if (type === "buttons") {
                const raw = interaction.fields.getTextInputValue("buttons_input")
                const lines = raw.split("\n").filter(l => l.includes("|"))
                const buttons = lines.slice(0, 5).map(line => {
                    const [label, url] = line.split("|").map(s => s.trim())
                    return { label, url }
                })
                data.buttons = buttons
                embedSessions.set(userId, data)
                await interaction.reply({ content: `✅ Added ${buttons.length} button(s)!`, ephemeral: true })
            }
        }

        // Script Panel Modal
        if (customId.startsWith("ssp_modal_add_")) {
            const userId = customId.replace("ssp_modal_add_", "")
            if (interaction.user.id !== userId) return interaction.reply({ content: "This is not your menu!", ephemeral: true })

            const session = scriptPanelSessions.get(userId)
            if (!session) return interaction.reply({ content: "Session expired.", ephemeral: true })

            const label = interaction.fields.getTextInputValue("btn_label")
            const script = interaction.fields.getTextInputValue("btn_script")

            if (session.buttons.length >= 25) return interaction.reply({ content: "❌ Maximum 25 buttons allowed!", ephemeral: true })

            session.buttons.push({ label, script })
            scriptPanelSessions.set(userId, session)

            await interaction.reply({ content: `✅ Button **${label}** added! Don't forget to select **Save & Finish**.`, ephemeral: true })
        }
    }
})

client.login(TOKEN)
