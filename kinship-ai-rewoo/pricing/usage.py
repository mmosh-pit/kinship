from langchain_core.callbacks.base import BaseCallbackHandler
import os
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
import tiktoken  # For accurate token counting
from clickhouse_driver import Client

load_dotenv()

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI")
print(f"✅ Loaded Mongo DB: {MONGO_URI}")

MONGO_DB_NAME = os.getenv("MONGO_DB_NAME")
print(f"✅ Loaded Mongo DB: {MONGO_DB_NAME}")

if not MONGO_URI or not MONGO_DB_NAME:
    raise ValueError("MONGO_URI and MONGO_DB_NAME environment variables must be set")

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]
clickhouse_client = Client(
    host=os.getenv("CLICKHOUSE_DB_HOST"),
    port=os.getenv("CLICKHOUSE_DB_PORT"),
    user=os.getenv("CLICKHOUSE_DB_USERNAME"),
    password=os.getenv("CLICKHOUSE_DB_PASSWORD"),
    database="default"
)

class ClickHouseHandler(BaseCallbackHandler):
    def __init__(self):
        super().__init__()
    
    def select_data(self, table_name: str):
        """
        Select rows from a ClickHouse table.
        :param table_name: Name of the table (string)
        :param limit: Max number of rows to fetch
        :return: List of tuples
        """
        query = f"SELECT * FROM default.{table_name}"
        rows = clickhouse_client.execute(query)
        print("rowsrowsrows", rows)
        return rows

    def create_table_if_not_exists(self, table_name: str, schema: dict):
        """
        Create a ClickHouse table if it does not exist, with a dynamic schema.
        
        :param table_name: Name of the table (string)
        :param schema: Dictionary of column_name -> ClickHouse type
                    Example: {"id": "UInt32", "name": "String", "created_at": "DateTime"}
        :param order_by: Column name to use for ORDER BY (required for MergeTree)
        """
        # Build schema string like: "id UInt32, name String, created_at DateTime"
        schema_str = ", ".join([f"{col} {dtype}" for col, dtype in schema.items()])

        query = f"""
        CREATE TABLE IF NOT EXISTS default.{table_name} (
            {schema_str}
        ) ENGINE = MergeTree()
        ORDER BY id
        """
        clickhouse_client.execute(query)
    
    def get_next_id(self, table_name: str) -> int:
        schema = {
            "id": "UInt32",
            "wallet": "String",
            "agentId": "String",
            "value": "Float64",
            "input_cost": "Float64",
            "output_cost": "Float64",
            "created_at": "DateTime",
            "updated_date": "DateTime"
        }
    
        print("----- GET NEXT ID TABLE NAME -----", table_name)
        # ✅ Ensure table exists
        self.create_table_if_not_exists(table_name=table_name, schema=schema)

        # ✅ Use backticks only inside SQL query
        query = f"SELECT max(id) FROM default.`{table_name}`"
        result = clickhouse_client.execute(query)
        next_id = (result[0][0] or 0) + 1
        print("Next ID:", next_id)
        return next_id

    def list_tables(self, database: str = "default"):
        client.execute("DROP TABLE IF EXISTS default.mmosh_app_user_agent_usage")
        query = f"SHOW TABLES FROM {database}"
        print("---------------- TABLES --------------", clickhouse_client.execute(query))
        return clickhouse_client.execute(query)

    def insert_data(self, data: list, table_name: str):
        """
        Insert data into a ClickHouse table.
        :param table_name: Name of the table (string)
        :param data: List of tuples with values to insert
        Example: [(1, 'Alice'), (2, 'Bob')]
        """
        # self.list_tables()
        # ✅ Insert rows
        query = f"INSERT INTO default.`{table_name}` VALUES"
        clickhouse_client.execute(query, data)
        self.select_data("mmosh_app_user_agent_usage")
        return True
    
    def drop_table(self, table_name: str, if_exists: bool = True):
        """
        Drop a ClickHouse table.
        
        :param table_name: Name of the table (string)
        :param if_exists: If True, will only drop if table exists
        """
        try:
            query = f"DROP TABLE {'IF EXISTS' if if_exists else ''} default.`{table_name}`"
            clickhouse_client.execute(query)
            print(f"✅ Dropped table: {table_name}")
            return True
        except Exception as e:
            print(f"❌ Error dropping table {table_name}: {e}")
            return False

        

class CalculateTokenUsage(BaseCallbackHandler):
    def __init__(self, agentId: str, wallet: str):
        self.agentId = agentId
        self.encoder = tiktoken.encoding_for_model("gpt-4")
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.streaming_buffer = ""
        self.click_house = ClickHouseHandler()
        self.wallet = wallet
        self.current_tool = None

    def on_llm_start(self, serialized, prompts, **kwargs):
        """Count exact prompt tokens when LLM starts"""
        self.prompt_tokens = sum(len(self.encoder.encode(prompt)) for prompt in prompts)

    def on_llm_new_token(self, token: str, **kwargs):
        """Accumulate tokens during streaming and count periodically"""
        self.streaming_buffer += token
        
        # Count tokens in buffer every 10 tokens to balance accuracy/performance
        if len(self.streaming_buffer) > 50:  # Arbitrary buffer size
            new_tokens = len(self.encoder.encode(self.streaming_buffer))
            self.completion_tokens += new_tokens
            self.streaming_buffer = ""

    def on_llm_end(self, response, **kwargs):
        """Finalize token count and update database"""
        try:
            # Count any remaining tokens in buffer
            if self.streaming_buffer:
                new_tokens = len(self.encoder.encode(self.streaming_buffer))
                self.completion_tokens += new_tokens
            
            # If we have exact counts from API, use those (more accurate)
            if response.llm_output and 'token_usage' in response.llm_output:
                usage = response.llm_output['token_usage']
                self.prompt_tokens = usage.get('prompt_tokens', self.prompt_tokens)
                self.completion_tokens = usage.get('completion_tokens', self.completion_tokens)

            input_cost_per_million = 4  # $4 per 1M input tokens
            output_cost_per_million = 16  # $16 per 1M output tokens

            input_cost = (self.prompt_tokens / 1_000_000) * input_cost_per_million
            output_cost = (self.completion_tokens / 1_000_000) * output_cost_per_million
            total_cost = input_cost + output_cost

            print("agent id:", self.agentId)
            print("input cost:", input_cost)
            print("Output Cost:", output_cost)
            print("Total Cost:", total_cost)

            collection = db.get_collection("mmosh-app-usage")
            # user_doc = collection.find_one({"agentId": self.agentId, "wallet": self.wallet})
            # self.click_house.drop_table(table_name="mmosh_app_user_agent_usage", if_exists=True)
            # data = [(self.click_house.get_next_id(table_name="mmosh_app_user_agent_usage"), self.wallet, self.agentId, total_cost, input_cost, output_cost, datetime.utcnow(), datetime.utcnow())]
            # self.click_house.insert_data(data=data, table_name="mmosh_app_user_agent_usage")
            collection.insert_one({
                "wallet": self.wallet,
                "agentId": self.agentId,
                "value": total_cost,
                "inputCost": input_cost,
                "outputCost": output_cost,
                "withdrawalAmount": 0,
                "created_date": datetime.utcnow(),
                "updated_date": datetime.utcnow()
            })
            # if user_doc: 
            #     new_value = user_doc["value"] + total_cost
            #     new_input_value = user_doc["inputCost"] + input_cost
            #     new_output_value = user_doc["outputCost"] + output_cost
            #     collection.update_one(
            #         {"agentId": self.agentId, "wallet": self.wallet},
            #         {
            #             "$set": {
            #                 "value": new_value,
            #                 "inputCost": new_input_value,
            #                 "outputCost": new_output_value,
            #                 "updated_date": datetime.utcnow()
            #             }
            #         })
            # else:
            #     collection.insert_one({
            #         "wallet": self.wallet,
            #         "agentId": self.agentId,
            #         "value": total_cost,
            #         "inputCost": input_cost,
            #         "outputCost": output_cost,
            #         "withdrawalAmount": 0,
            #         "created_date": datetime.utcnow(),
            #         "updated_date": datetime.utcnow()
            #     })

        except Exception as e:
            print(f"❌ Error in token calculation: {str(e)}")