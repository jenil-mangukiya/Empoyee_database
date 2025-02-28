// Import required modules
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const json2csv = require('json2csv').parse;
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

// Initialize the Express app
const app = express();
const PORT = 5000;
const upload = multer({ dest: 'uploads/' });

// Enable CORS
app.use(cors());
app.use(bodyParser.json());

// Remove the line that serves static files from the "public" directory
// app.use(express.static(path.join(__dirname, 'public')));

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

// Endpoint to download CSV template
app.get('/download-template', (req, res) => {
  const csvHeaders = ['Name', 'City', 'State', 'Salary', 'JoiningDate', 'Department'];
  const csvContent = csvHeaders.join(',') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=employee_template.csv');
  res.status(200).send(csvContent);
});

// Import Document with validation
app.post('/import-document', upload.single('file'), (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.file.filename);
  const employees = [];
  const errors = [];
  const existingEntries = new Set();

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      employees.push(row);
    })
    .on('end', async () => {
      try {
        for (const employee of employees) {
          const { Name, City, State, Salary, JoiningDate, Department } = employee;

          // Validate fields
          if (!Name || !City || !State || !Salary || !JoiningDate || !Department) {
            errors.push(`Missing required fields for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (!/^[A-Za-z\s]+$/.test(Name)) {
            errors.push(`Invalid Name format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (!/^[A-Za-z\s]+$/.test(City)) {
            errors.push(`Invalid City format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (!/^[A-Za-z\s]+$/.test(State)) {
            errors.push(`Invalid State format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (isNaN(parseFloat(Salary))) {
            errors.push(`Invalid Salary format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (isNaN(new Date(JoiningDate).getTime())) {
            errors.push(`Invalid JoiningDate format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          if (!/^[A-Za-z\s]+$/.test(Department)) {
            errors.push(`Invalid Department format for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          // Check for swapped fields
          if (
            /^[A-Za-z\s]+$/.test(State) && /^[A-Za-z\s]+$/.test(Name) &&
            /^[A-Za-z\s]+$/.test(City) && isNaN(parseFloat(Salary)) &&
            isNaN(new Date(JoiningDate).getTime()) && /^[A-Za-z\s]+$/.test(Department)
          ) {
            errors.push(`Swapped fields detected for employee: ${JSON.stringify(employee)}`);
            continue;
          }

          // Check for duplicate entries in the same file
          const entryKey = `${Name}-${City}-${State}-${Department}`;
          if (existingEntries.has(entryKey)) {
            errors.push(`Duplicate entry found in the file for employee: ${JSON.stringify(employee)}`);
            continue;
          }
          existingEntries.add(entryKey);

          // Check for duplicate entries in the database by Name
          const existingEmployeeByName = await Employee.findOne({ Name });
          if (existingEmployeeByName) {
            errors.push(`Duplicate entry found in the database for employee with Name: ${Name}`);
            continue; // Skip duplicate entry
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
        }

        if (errors.length > 0) {
          console.error('Errors during import:', errors);
          return res.status(400).json({ message: 'Failed to import some employees', errors });
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

// Export Employee Data with selectable fields and formats
app.get('/export-document', async (req, res) => {
  try {
    const { fields, format = 'csv' } = req.query;
    const selectedFields = fields ? fields.split(',') : ['user_id', 'Name', 'City', 'State', 'Salary', 'JoiningDate', 'Department'];

    const employees = await Employee.find().select(selectedFields.join(' ')).lean();
    if (employees.length === 0) {
      return res.status(404).json({ message: 'No employees found' });
    }

    switch (format.toLowerCase()) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=employees.json');
        res.status(200).send(JSON.stringify(employees, null, 2));
        break;

      case 'csv':
        const csvContent = json2csv(employees, { fields: selectedFields });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=employees.csv');
        res.status(200).send(csvContent);
        break;

      case 'xlsx':
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(employees);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=employees.xlsx');
        res.status(200).send(excelBuffer);
        break;

      case 'pdf':
        const doc = new PDFDocument();
        let buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
          const pdfData = Buffer.concat(buffers);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename=employees.pdf');
          res.status(200).send(pdfData);
        });
        doc.text(JSON.stringify(employees, null, 2));
        doc.end();
        break;

      default:
        res.status(400).json({ message: 'Invalid format specified' });
    }
  } catch (error) {
    console.error('Error exporting employee data:', error);
    res.status(500).json({ message: 'Failed to export employee data' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
