const mongoose = require("mongoose");
const { getModel } = require("./getModel");
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      unique: true,
    },
    idNumber: {
      type: String,
      required: false,
    },
    type: {
      type: String,
      required: [true, "Type is required"],
      enum: [
        "Company",
        "Project Manager",
        "Universal",
        "Core",
        "Resident",
        "Landlord",
        "Supplier",
        "Customer_Support",
        "Customer",
      ],
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FacilityDepartment",
    },
    role: {
      type: String,
      required: [true, "Role is required"],
      enum: ["admin", "editor", "user", "guard", "family", "Staff", "supplier"],
    },
    permissions: {
      type: Object,
      default: {
        levy: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        lease: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        utility: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        maintenance: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        tickets: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        booking: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        procurement: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        vas: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        visitorAccess: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        handover: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        campaigns: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
        accounts: {
          create: false,
          read: false,
          update: false,
          delete: false,
          approve: false,
        },
      },
    },
    kyc: {
      Id: {
        type: String,
      },
    },
    isEnabled: {
      type: Boolean,
      required: false,
    },
    companies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
      },
    ],
    customerData: [
      {
        facilityId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Facility",
        },
        customerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Customer",
        },
        isEnabled: {
          type: Boolean,
          required: false,
        },
      },
    ],
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
    },
    guardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guard",
      required: false,
    },
    verificationCode: {
      type: Number,
      required: false,
    },
    verificationExpiration: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  },
);
userSchema.index({ fullName: "text", email: "text" });

const facilitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Facility name is required"],
      trim: true,
      minlength: [1, "Facility name must be at least 1 character long"],
    },
    location: {
      type: String,
      required: true,
    },
    isOnboarded: { type: Boolean, default: false },
    subDivision: { type: String, required: true },
    isEnabled: { type: Boolean, required: true },
    divisionArray: [],
    landReferenceNumbers: [],
    defaultMeasurement: { type: String, required: false },
    totalCommonArea: { type: String, required: false },
    totalLettableArea: { type: String, required: false },
    modules: {
      visitor: { type: Boolean },
      levy: { type: Boolean },
      maintenance: { type: Boolean },
      propertyManagement: { type: Boolean },
      lease: { type: Boolean },
      vas: { type: Boolean },
      tickets: { type: Boolean },
      utility: { type: Boolean },
      booking: { type: Boolean },
      handover: { type: Boolean },
      expense: { type: Boolean },
      campaign: { type: Boolean },
      procurement: { type: Boolean },
      accounts: { type: Boolean },
    },
    accountNumber: {
      type: String,
      default: null,
      trim: true,
      unique: true,
    },
    logo: {
      type: String,
      trim: false,
      default: null,
    },
    taxNumber: {
      type: String,
      default: null,
      trim: true,
      description: "KRA Tax Identification Number (TIN) for eTims integration",
    },
    dbName: {
      type: String,
      required: [true, "Database name is required"],
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);
facilitySchema.index({ name: 1 });

const unitSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    unitType: {
      type: String,
      required: true,
    },
    division: {
      type: String,
      required: true,
    },
    floorUnitNo: {
      type: String,
      required: true,
    },
    lettableFloorArea: {
      type: String,
      required: false,
    },
    landRateNumber: {
      type: String,
      required: false,
    },
    grossArea: {
      type: Number,
      required: false,
    },
    netLettableArea: {
      type: Number,
      required: false,
    },
    status: {
      type: String,
      required: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
    },
    homeOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    isManagedByPropertyManager: {
      type: Boolean,
      default: false,
    },
    propertyManagerName: {
      type: String,
      required: function () {
        return this.isManagedByPropertyManager === true;
      },
    },
    isListedForBooking: {
      type: Boolean,
      default: false,
    },

    listedInMoveIn: { type: Boolean, default: false, index: true },
    listingType: { type: String, enum: ["rent", "sale"], default: "rent" },
    moveInPrice: { type: Number, default: null },
    moveInBedrooms: { type: Number, default: null },
    moveInBathrooms: { type: Number, default: null },
    moveInDescription: { type: String, default: null },
    moveInImages: { type: [String], default: [] },
    moveInAmenities: { type: [String], default: [] },
    moveInApproval: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: null,
      index: true,
    },

    occupants: [
      {
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
        customerType: { type: String, enum: ["home owner", "tenant"] },
        residentType: { type: String, enum: ["resident"] },
        moveInDate: { type: Date },
        moveOutDate: { type: Date, default: null },
      },
    ],
    unitDocuments: [
      {
        documentName: {
          type: String,
          required: true,
        },
        documentType: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "DocumentType",
          required: true,
        },
        document: {
          type: String,
          required: true,
        },
      },
    ],
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
  },
  {
    timestamps: true,
  },
);

unitSchema.pre("save", function (next) {
  if (!this.isManagedByPropertyManager) {
    this.propertyManagerName = null;
  }
  next();
});

unitSchema.index({ name: 1 });
unitSchema.index({ isManagedByPropertyManager: 1 });
unitSchema.index({ isListedForBooking: 1 });
const residentSchema = new mongoose.Schema(
  {
    residentId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    nationalId: {
      type: String,
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    unitName: {
      type: String,
      required: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
    },
    contracts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LevyContract",
      },
    ],
    levies: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Levy",
      },
    ],
    invoices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invoice",
      },
    ],
    paymentHistory: [
      {
        paymentDate: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        paymentMethod: {
          type: String,
        },
        transactionId: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    registrationDate: {
      type: Date,
      default: Date.now,
    },
    paymentFrequency: {
      type: String,
      enum: ["Monthly", "Quarterly", "Annually"],
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
    },
    reminders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reminder",
      },
    ],
    notifications: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Notification",
      },
    ],
    penalties: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Penalty",
      },
    ],
    penaltyStatus: {
      type: String,
      enum: ["Pending", "Paid", "Waived"],
      default: "Pending",
    },
    notes: {
      type: String,
    },

    welcomeMessageSent: { type: Boolean, default: false },
    publicToken: { type: String, unique: true, sparse: true },
    publicTokenExpiresAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

const User = getModel("User", userSchema);
const Facility = getModel("Facility", facilitySchema);
const Unit = getModel("Unit", unitSchema);
const Resident = getModel("Resident", residentSchema);

module.exports = { User, Facility, Unit, Resident };
