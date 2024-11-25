import dotenv from "dotenv";
dotenv.config();
import readline from "readline";
import { ChatGroq } from "@langchain/groq";
import { SqlToolkit } from "langchain/agents/toolkits/sql";
import { DataSource } from "typeorm";
import { SqlDatabase } from "langchain/sql_db";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// Konfigurasi LLM
const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "mixtral-8x7b-32768",
  temperature: 0,
});

// Konfigurasi database
const datasource = new DataSource({
  type: "mysql",
  host: process.env.DB_HOST,
  port: 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: false,
});

(async () => {
  const db = await SqlDatabase.fromDataSourceParams({
    appDataSource: datasource,
  });

  const toolkit = new SqlToolkit(db, llm);
  const tools = toolkit.getTools();

  console.log("Available tools:");
  console.log(
    tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }))
  );

  const agentExecutor = createReactAgent({ llm, tools });

  console.log(
    "Aplikasi siap. Masukkan query Anda (ketik 'exit' untuk keluar):"
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Maintain chat history
  const chatHistory = [];

  chatHistory.push([
    "user",
    "Setiap table memiliki relasi dari nama, contohnya kolom brandId pada tabel Outlet merujuk ke kolom id pada Brand. ",
  ]);

  chatHistory.push([
    "user",
    "Saya hanya bisa membaca data Outlet dari brand bernama SR Antasari saja. ",
  ]);

  chatHistory.push([
    "user",
    "Saya hanya bisa membaca data bukan menulis data. ",
  ]);


  const askQuestion = async (query) => {
    if (query.trim().toLowerCase() === "exit") {
      console.log("Keluar dari aplikasi. Terima kasih!");
      rl.close();
      return;
    }

    try {
      // Add user message to chat history
      chatHistory.push(["user", query]);

      console.log("Processing query...");
      const events = await agentExecutor.stream(
        { messages: chatHistory },
        { streamMode: "values" }
      );

      for await (const event of events) {
        const lastMsg = event.messages[event.messages.length - 1];
        if (lastMsg.tool_calls?.length) {
          console.dir(lastMsg.tool_calls, { depth: null });
        } else if (lastMsg.content) {
          // Add agent's response to chat history
          chatHistory.push(["assistant", lastMsg.content]);

          // Display the response with a hardcoded prompt
          const hardcodedPrompt = "query-sql: ";
          console.log(hardcodedPrompt + lastMsg.content);
        }
      }
    } catch (error) {
      console.error("Error:", error.error.failed_generation);
    }

    rl.question("Masukkan query Anda: ", askQuestion);
  };

  rl.question("Masukkan query Anda: ", askQuestion);
})();
