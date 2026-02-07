import csv
import sqlite3
import os

def convert_csv_to_db(csv_filename, db_filename):
    """
    Converts a specific election CSV file to a SQLite database.
    """
    
    # Check if input file exists
    if not os.path.exists(csv_filename):
        print(f"Error: The file '{csv_filename}' was not found in the current directory.")
        return

    print(f"Processing '{csv_filename}'...")

    try:
        # Connect to SQLite database (creates it if it doesn't exist)
        conn = sqlite3.connect(db_filename)
        cursor = conn.cursor()

        # Define the schema based on your CSV structure
        # We drop the table if it exists to ensure a clean slate on re-runs
        cursor.execute("DROP TABLE IF EXISTS election_results")
        
        create_table_sql = """
        CREATE TABLE election_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            state TEXT,
            county_name TEXT,
            year INTEGER,
            state_po TEXT,
            county_fips TEXT,
            office TEXT,
            candidate TEXT,
            party TEXT,
            candidatevotes INTEGER,
            totalvotes INTEGER,
            version TEXT,
            mode TEXT
        );
        """
        cursor.execute(create_table_sql)

        # Open the CSV file and read data
        with open(csv_filename, 'r', encoding='utf-8') as csv_file:
            # Use DictReader to handle headers automatically
            csv_reader = csv.DictReader(csv_file)
            
            # Prepare data for bulk insertion
            to_db = []
            row_count = 0
            
            for row in csv_reader:
                # helper function to handle empty strings for integer fields
                def safe_int(val):
                    if val and val.strip():
                        try:
                            return int(float(val)) # Handle "100.0" or "100"
                        except ValueError:
                            return 0
                    return 0

                data_tuple = (
                    row['state'],
                    row['county_name'],
                    safe_int(row['year']),
                    row['state_po'],
                    row['county_fips'],
                    row['office'],
                    row['candidate'],
                    row['party'],
                    safe_int(row['candidatevotes']),
                    safe_int(row['totalvotes']),
                    row['version'],
                    row['mode']
                )
                to_db.append(data_tuple)
                row_count += 1
                
                # Insert in batches of 10,000 to be memory efficient
                if len(to_db) >= 10000:
                    cursor.executemany("""
                        INSERT INTO election_results (
                            state, county_name, year, state_po, county_fips, 
                            office, candidate, party, candidatevotes, totalvotes, 
                            version, mode
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, to_db)
                    to_db = [] # Clear the list
                    print(f"Processed {row_count} rows...", end='\r')

            # Insert any remaining rows
            if to_db:
                cursor.executemany("""
                    INSERT INTO election_results (
                        state, county_name, year, state_po, county_fips, 
                        office, candidate, party, candidatevotes, totalvotes, 
                        version, mode
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, to_db)

        # Commit changes and close connection
        conn.commit()
        conn.close()
        
        print(f"\nSuccess! Converted {row_count} rows to '{db_filename}'.")

    except Exception as e:
        print(f"\nAn error occurred: {e}")

if __name__ == "__main__":
    # Configuration
    INPUT_CSV = "2000-2024/countypres_2000-2024.csv"
    OUTPUT_DB = "2000-2024/election_data.db"
    
    convert_csv_to_db(INPUT_CSV, OUTPUT_DB)