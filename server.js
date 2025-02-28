// Import required modules
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

// Initialize the Express app
const app = express();
const PORT = 5000;
const upload = multer({ dest: 'uploads/' });

// Enable CORS
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose
  .connect("mongodb://localhost:27017/my_database", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Define Employee Schema
const employeeSchema = new mongoose.Schema({
  Name: { type: String, required: true },
  City: { type: String, required: true },
  State: { type: String, required: true },
  Salary: { type: Number, required: true },
  JoiningDate: { type: Date, required: true },
  Department: { type: String, required: true },
  user_id: {
    type: String,
    unique: true, // Ensure user_id is unique
    required: true,
  },
});
// Create an index for better search performance
employeeSchema.index({ user_id: 1, Name: 1, City: 1 });


// Use the existing 'user' collection
const Employee = mongoose.model("user", employeeSchema, "user");

// Function to generate the next user_id
async function generateUserId() {
  try {
    const lastEmployee = await Employee.findOne()
      .sort({ user_id: -1 })
      .collation({ locale: "en", numericOrdering: true });

    if (!lastEmployee || !lastEmployee.user_id) {
      return "EMP001"; // Default value if no user_id exists
    }

    const lastUserId = lastEmployee.user_id;
    if (!lastUserId.startsWith("EMP")) {
      throw new Error("Invalid user_id format");
    }

    const lastNumber = parseInt(lastUserId.replace("EMP", ""), 10);
    if (isNaN(lastNumber)) {
      throw new Error("Failed to parse last user_id number");
    }

    return `EMP${(lastNumber + 1).toString().padStart(3, "0")}`;
  } catch (error) {
    console.error("Error generating user ID:", error);
    throw new Error("Failed to generate user ID");
  }
}

// API Endpoints

// Get all employees with pagination
app.get("/employees", async (req, res) => {
  const { page = 1, limit = 10 } = req.query; // Default to page 1, limit 10
  try {
    const employees = await Employee.find()
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const totalEmployees = await Employee.countDocuments();
    res.json({
      employees,
      totalPages: Math.ceil(totalEmployees / limit),
      currentPage: parseInt(page),
      totalRecords: totalEmployees // Include totalRecords in the response
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ message: "Failed to fetch employees" });
  }
});

// Get employee by user_id
app.get("/employees/user/:user_id", async (req, res) => {
  const { user_id } = req.params;
  try {
    const employee = await Employee.findOne({ user_id: user_id });

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
        details: `No employee found with ID: ${user_id}`,
      });
    }

    res.json(employee);
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({
      message: "Failed to load employee data",
      details: error.message,
    });
  }
});

// Add New Employee (Assigns `user_id` Automatically)
app.post("/submit-form", async (req, res) => {
  try {
    const { Name, City, State, Salary, JoiningDate, Department } = req.body;
    if (!Name || !City || !State || !Salary || !JoiningDate || !Department) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user_id = await generateUserId(); // Generate a new user_id

    const newEmployee = new Employee({
      user_id,
      Name,
      City,
      State,
      Salary: parseFloat(Salary),
      JoiningDate: new Date(JoiningDate),
      Department,
    });

    await newEmployee.save();
    res.json({ message: "Employee saved successfully!" });
  } catch (error) {
    console.error("Error saving employee:", error);
    res.status(500).json({ message: "Failed to save employee" });
  }
});

// Update Employee
app.put("/employees/:id", async (req, res) => {
  console.log("Incoming update data:", req.body);
  try {
    const { Name, City, State, Salary, JoiningDate, Department } = req.body;

    const updatedEmployee = await Employee.findOneAndUpdate(
      { user_id: req.params.id }, // Match by user_id
      { Name, City, State, Salary, JoiningDate, Department },
      { new: true, runValidators: true }
    );

    if (!updatedEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ message: "Failed to update employee" });
  }
}

);

// Delete Employee
app.delete("/employees/:id", async (req, res) => {
  try {
    const deletedEmployee = await Employee.findOneAndDelete({
      user_id: req.params.id,
    });
    if (!deletedEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ message: "Failed to delete employee" });
  }
});


// Search Employees by User ID, Name, or City with pagination
app.get("/employees/search", async (req, res) => {
  const { query, page = 1, limit = 10 } = req.query; // Default to page 1, limit 10

  if (!query) {
    return res.status(400).json({ message: "Search query is required" });
  }

  try {
    const employees = await Employee.find({
      $or: [
        { user_id: { $regex: query, $options: "i" } },
        { Name: { $regex: query, $options: "i" } },
        { City: { $regex: query, $options: "i" } },
      ],
    })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const totalEmployees = await Employee.countDocuments({
      $or: [
        { user_id: { $regex: query, $options: "i" } },
        { Name: { $regex: query, $options: "i" } },
        { City: { $regex: query, $options: "i" } },
      ],
    });
    res.json({
      employees,
      totalPages: Math.ceil(totalEmployees / limit),
      currentPage: parseInt(page),
      totalRecords: totalEmployees // Include totalRecords in the response
    });
  } catch (error) {
    console.error("Error searching employees:", error);
    res.status(500).json({ message: "Failed to search employees" });
  }
});

// Import Document
app.post('/import-document', upload.single('file'), (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.file.filename);
  const employees = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      employees.push(row);
    })
    .on('end', async () => {
      try {
        // Process the employees array and save to the database
        for (const employee of employees) {
          const { Name, City, State, Salary, JoiningDate, Department } = employee;
          const user_id = await generateUserId(); // Generate a new user_id

          const newEmployee = new Employee({
            user_id,
            Name,
            City,
            State,
            Salary: parseFloat(Salary),
            JoiningDate: new Date(JoiningDate),
            Department,
          });

          await newEmployee.save();
        }
        console.log('CSV file successfully processed:', employees);
        res.status(200).json({ message: 'Document imported and employees saved successfully' });
      } catch (error) {
        console.error('Error saving employees:', error);
        res.status(500).json({ message: 'Failed to save employees' });
      }
    })
    .on('error', (error) => {
      console.error('Error processing CSV file:', error);
      res.status(500).json({ message: 'Failed to import document' });
    });
});

// Export Employee Data to CSV
app.get('/export-document', async (req, res) => {
  try {
    const employees = await Employee.find().lean();
    if (employees.length === 0) {
      return res.status(404).json({ message: 'No employees found' });
    }

    const csvHeaders = ['user_id', 'Name', 'City', 'State', 'Salary', 'JoiningDate', 'Department'];
    const csvRows = employees.map(employee => csvHeaders.map(header => employee[header]));

    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=employees.csv');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error exporting employee data:', error);
    res.status(500).json({ message: 'Failed to export employee data' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
