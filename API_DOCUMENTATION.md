# Lost and Found API Documentation

**Base URL:** `http://localhost:8080/api`  
**Version:** 1.0  
**Last Updated:** November 19, 2025

---

## Table of Contents

1. [Authentication](#authentication)
2. [Lost Items](#lost-items)
3. [Found Items](#found-items)
4. [Matching System](#matching-system)
5. [Categories](#categories)
6. [Locations](#locations)
7. [Error Handling](#error-handling)
8. [Rate Limiting](#rate-limiting)

---

## Authentication

All protected endpoints require JWT token in the Authorization header:

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### 1. Register User

**POST** `/auth/register`

Create a new user account. New accounts have 'pending' status and require admin approval.

**Request Body:**

```json
{
  "school_id": "25-1234",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@school.edu",
  "contact_number": "09123456789",
  "password": "StrongPass123!",
  "confirm_password": "StrongPass123!"
}
```

**Validation Rules:**

- `school_id`: Required, format: `XX-XXXX` or `ADMIN-YYYY`
- `first_name`: Required, 2-50 characters, letters only
- `last_name`: Required, 2-50 characters, letters only
- `email`: Optional, valid email format
- `contact_number`: Optional, 11 digits (09XXXXXXXXX)
- `password`: Required, min 8 chars, must include uppercase, lowercase, number, special char
- `confirm_password`: Must match password

**Response (201):**

```json
{
  "success": true,
  "message": "Registration successful. Awaiting admin approval.",
  "data": {
    "userId": 123,
    "school_id": "25-1234",
    "status": "pending",
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc..."
  }
}
```

---

### 2. Login

**POST** `/auth/login`

Authenticate user and receive access tokens.

**Request Body:**

```json
{
  "school_id": "25-1234",
  "password": "StrongPass123!"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": {
      "id": 123,
      "school_id": "25-1234",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@school.edu",
      "role": "user",
      "status": "active"
    }
  }
}
```

**Error (401) - Account Locked:**

```json
{
  "success": false,
  "message": "Account locked due to too many failed attempts. Try again in 15 minutes."
}
```

---

### 3. Get Current User

**GET** `/auth/me`

Get currently authenticated user's profile.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 123,
    "school_id": "25-1234",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@school.edu",
    "role": "user",
    "status": "active"
  }
}
```

---

### 4. Logout

**POST** `/auth/logout`

Logout user and invalidate refresh token.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200):**

```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

### 5. Refresh Token

**POST** `/auth/refresh`

Get a new access token using refresh token.

**Request Body:**

```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

---

## Lost Items

### 1. Report Lost Item

**POST** `/lost-items`

Report a lost item. Supports multipart/form-data for image uploads.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**

```
title: "Black iPhone 13 Pro"
description: "Lost near library on November 15. Has a blue case with cracked screen protector."
category_id: 1
last_seen_location_id: 5
last_seen_date: "2025-11-15"
last_seen_time: "14:30:00"
unique_identifiers: "Serial: ABC123XYZ"
reward_offered: 500.00
contact_preference: "email"
images: [File, File] (max 5 files, 5MB each)
```

**Required Fields:**

- `title`: 5-255 characters
- `description`: 20-2000 characters
- `category_id`: Valid category ID
- `last_seen_date`: Date (not in future)

**Response (201):**

```json
{
  "success": true,
  "message": "Lost item reported successfully. Pending admin approval.",
  "data": {
    "id": 456,
    "title": "Black iPhone 13 Pro",
    "description": "Lost near library...",
    "category_id": 1,
    "status": "pending",
    "images": ["lost_456_1700123456789.jpg"]
  }
}
```

---

### 2. Get Lost Items

**GET** `/lost-items`

List lost items with filtering and pagination.

**Query Parameters:**

- `search`: Keyword search (title, description)
- `category_id`: Filter by category
- `location_id`: Filter by location
- `status`: Filter by status (admin only)
- `date_from`: Start date (YYYY-MM-DD)
- `date_to`: End date (YYYY-MM-DD)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Examples:**

```
GET /lost-items?search=iphone&category_id=1
GET /lost-items?date_from=2025-11-01&date_to=2025-11-30
GET /lost-items?page=2&limit=10
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 456,
        "title": "Black iPhone 13 Pro",
        "description": "Lost near library...",
        "category": "Electronics",
        "category_id": 1,
        "status": "approved",
        "last_seen_date": "2025-11-15T00:00:00.000Z",
        "last_seen_time": "14:30:00",
        "last_seen_location": "Library",
        "reward_offered": 500.0,
        "reporter_name": "John Doe",
        "reporter_school_id": "25-1234",
        "primary_image": "http://localhost:8080/uploads/lost_456_1700123456789.jpg",
        "created_at": "2025-11-16T10:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "totalPages": 3
    }
  }
}
```

---

### 3. Get Lost Item by ID

**GET** `/lost-items/:id`

Get detailed information about a specific lost item.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 456,
    "title": "Black iPhone 13 Pro",
    "description": "Lost near library on November 15...",
    "category": "Electronics",
    "category_id": 1,
    "status": "approved",
    "last_seen_location": "Library",
    "last_seen_location_id": 5,
    "last_seen_date": "2025-11-15T00:00:00.000Z",
    "last_seen_time": "14:30:00",
    "unique_identifiers": "Serial: ABC123XYZ",
    "reward_offered": 500.0,
    "reporter_name": "John Doe",
    "reporter_school_id": "25-1234",
    "reporter_email": "john.doe@school.edu",
    "reporter_contact": "09123456789",
    "images": [
      "http://localhost:8080/uploads/lost_456_1700123456789.jpg",
      "http://localhost:8080/uploads/lost_456_1700123456790.jpg"
    ],
    "created_at": "2025-11-16T10:30:00.000Z",
    "updated_at": "2025-11-16T10:30:00.000Z"
  }
}
```

---

### 4. Update Lost Item

**PUT** `/lost-items/:id`

Update a lost item. Only owner or admin can update. Status resets to 'pending' after update.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**

```
title: "Updated Title"
description: "Updated description..."
category_id: 1
last_seen_location_id: 5
last_seen_date: "2025-11-15"
```

**Response (200):**

```json
{
  "success": true,
  "message": "Lost item updated successfully. Pending admin re-approval.",
  "data": {
    "id": 456,
    "title": "Updated Title",
    "description": "Updated description...",
    "category_id": 1,
    "status": "pending"
  }
}
```

---

### 5. Delete Lost Item

**DELETE** `/lost-items/:id`

Soft delete a lost item. Only owner or admin can delete.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200):**

```json
{
  "success": true,
  "message": "Lost item deleted successfully"
}
```

---

### 6. Review Lost Item (Admin/Security)

**PATCH** `/lost-items/:id/review`

Approve or reject a lost item report.

**Access:** Admin or Security only

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Request Body (Approve):**

```json
{
  "status": "approved"
}
```

**Request Body (Reject):**

```json
{
  "status": "rejected",
  "rejection_reason": "Insufficient details or inappropriate content"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Lost item approved successfully"
}
```

---

## Found Items

### 1. Report Found Item

**POST** `/found-items`

Report a found item.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: multipart/form-data
```

**Form Data:**

```
title: "Found Black iPhone"
description: "Found near library entrance with damaged screen"
category_id: 1
found_location_id: 5
found_date: "2025-11-15"
found_time: "16:45:00"
storage_location_id: 8
storage_notes: "Stored in security office, shelf A3"
unique_identifiers: "No visible serial number"
images: [File, File]
```

**Response (201):**

```json
{
  "success": true,
  "message": "Found item reported successfully. Pending admin approval.",
  "data": {
    "id": 789,
    "title": "Found Black iPhone",
    "description": "Found near library entrance...",
    "category_id": 1,
    "status": "pending"
  }
}
```

---

### 2. Get Found Items

**GET** `/found-items`

List found items with filtering.

**Query Parameters:**

- `search`: Keyword search
- `category_id`: Filter by category
- `location_id`: Filter by location
- `status`: Filter by status
- `is_claimed`: Filter by claim status (true/false)
- `date_from`: Start date
- `date_to`: End date
- `page`: Page number
- `limit`: Items per page

**Example:**

```
GET /found-items?category_id=1&is_claimed=false&page=1&limit=20
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 789,
        "title": "Found Black iPhone",
        "description": "Found near library entrance...",
        "category": "Electronics",
        "status": "approved",
        "found_date": "2025-11-15T00:00:00.000Z",
        "found_time": "16:45:00",
        "found_location": "Library Entrance",
        "storage_location": "Security Office",
        "storage_notes": "Shelf A3",
        "is_claimed": false,
        "reporter_name": "Jane Smith",
        "reporter_school_id": "25-5678",
        "primary_image": "http://localhost:8080/uploads/found_789_1700123456789.jpg"
      }
    ],
    "pagination": {
      "total": 30,
      "page": 1,
      "limit": 20,
      "totalPages": 2
    }
  }
}
```

---

### 3. Get Found Item by ID

**GET** `/found-items/:id`

Get detailed information about a specific found item.

**Response:** Similar structure to Lost Item details with found-specific fields.

---

### 4. Update Found Item

**PUT** `/found-items/:id`

Update a found item. Only owner or admin.

**Response:** Similar to lost item update.

---

### 5. Delete Found Item

**DELETE** `/found-items/:id`

Soft delete a found item.

---

### 6. Review Found Item (Admin/Security)

**PATCH** `/found-items/:id/review`

Approve or reject a found item report.

**Request Body:**

```json
{
  "status": "approved"
}
```

---

## Matching System

### 1. Find Matches for Lost Item

**GET** `/matches/lost/:id`

Find potential matches for a lost item. Automatically saves top 5 matches.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Query Parameters:**

- `min_score`: Minimum similarity score (0-100, default: 50)
- `limit`: Max results (default: 10)

**Example:**

```
GET /matches/lost/456?min_score=60&limit=5
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "found_item_id": 789,
      "match_score": 85,
      "similarity_score": 85,
      "confidence": "high",
      "found_item": {
        "id": 789,
        "title": "Found Black iPhone",
        "description": "Found near library entrance...",
        "category": "Electronics",
        "found_date": "2025-11-15T00:00:00.000Z",
        "found_time": "16:45:00",
        "location": "Library Entrance",
        "storage_location_id": 8,
        "storage_notes": "Security Office - Shelf A3"
      }
    }
  ]
}
```

**Matching Algorithm:**

- **Category Match:** 40 points
- **Location Proximity:** 30 points
- **Date Proximity:** 20 points
- **Description Similarity:** 10 points

**Confidence Levels:**

- `high`: 80-100
- `medium`: 60-79
- `possible`: 50-59

---

### 2. Find Matches for Found Item

**GET** `/matches/found/:id`

Find potential matches for a found item.

**Response:** Similar structure, returns lost items that might match.

---

### 3. Get My Lost Item Matches

**GET** `/matches/my-lost-items`

Get all matches for the current user's lost items.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "lost_item_id": 456,
      "lost_item_title": "Black iPhone 13 Pro",
      "matches": [
        {
          "found_item_id": 789,
          "found_title": "Found Black iPhone",
          "similarity_score": 85,
          "status": "suggested",
          "created_at": "2025-11-16T10:30:00.000Z"
        }
      ]
    }
  ]
}
```

---

### 4. Get Saved Matches ✨ NEW

**GET** `/matches/saved/:itemType/:itemId`

Retrieve saved matches for a specific item from the database.

**Path Parameters:**

- `itemType`: "lost" or "found"
- `itemId`: Item ID

**Query Parameters:**

- `status`: Filter by match status (suggested/confirmed/dismissed)

**Examples:**

```
GET /matches/saved/lost/456
GET /matches/saved/lost/456?status=confirmed
GET /matches/saved/found/789?status=suggested
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 12,
      "lost_item_id": 456,
      "found_item_id": 789,
      "similarity_score": 85.5,
      "match_reason": null,
      "status": "suggested",
      "dismissed_by": null,
      "confirmed_by": null,
      "action_date": null,
      "created_at": "2025-11-16T10:30:00.000Z",
      "found_title": "Found Black iPhone",
      "found_description": "Found near library entrance...",
      "found_category_id": 1,
      "category_name": "Electronics",
      "found_location_id": 5,
      "location_name": "Library Entrance",
      "found_date": "2025-11-15T00:00:00.000Z",
      "storage_location_id": 8,
      "storage_notes": "Security Office - Shelf A3"
    }
  ]
}
```

---

### 5. Update Match Status ✨ NEW

**PATCH** `/matches/:matchId/status`

Update the status of a match.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Path Parameters:**

- `matchId`: Match ID

**Request Body:**

```json
{
  "status": "confirmed"
}
```

**Valid Status Values:**

- `suggested`: Algorithm-suggested match
- `confirmed`: User confirmed it's their item
- `dismissed`: User rejected the match

**Response (200):**

```json
{
  "success": true,
  "message": "Match status updated to confirmed",
  "data": {
    "id": 12,
    "lost_item_id": 456,
    "found_item_id": 789,
    "similarity_score": 85.5,
    "status": "confirmed",
    "confirmed_by": 123,
    "action_date": "2025-11-16T11:00:00.000Z",
    "lost_title": "Black iPhone 13 Pro",
    "found_title": "Found Black iPhone",
    "category_name": "Electronics"
  }
}
```

---

### 6. Accept Match

**POST** `/matches/:id/accept`

Confirm a match as correct.

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response (200):**

```json
{
  "success": true,
  "message": "Match accepted successfully"
}
```

---

### 7. Reject Match

**POST** `/matches/:id/reject`

Dismiss an incorrect match.

**Response (200):**

```json
{
  "success": true,
  "message": "Match rejected successfully"
}
```

---

### 8. Run Auto-Matching (Admin)

**POST** `/matches/run-auto-match`

Trigger bulk matching for all items.

**Access:** Admin only

**Response (200):**

```json
{
  "success": true,
  "message": "Auto-matching completed",
  "data": {
    "matches_created": 45
  }
}
```

---

## Categories

### 1. Get All Categories

**GET** `/categories`

List all active categories.

**Access:** Public

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Electronics",
      "description": "Phones, laptops, tablets, etc.",
      "icon": "📱",
      "is_active": true,
      "lost_items_count": 25,
      "found_items_count": 18
    },
    {
      "id": 2,
      "name": "Personal Items",
      "description": "Wallets, IDs, keys, etc.",
      "icon": "👝",
      "is_active": true,
      "lost_items_count": 40,
      "found_items_count": 32
    }
  ]
}
```

---

### 2. Get Category by ID

**GET** `/categories/:id`

Get single category details.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Electronics",
    "description": "Phones, laptops, tablets, etc.",
    "icon": "📱",
    "is_active": true
  }
}
```

---

### 3. Create Category (Admin)

**POST** `/categories`

Create a new category.

**Access:** Admin only

**Headers:**

```
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Books & Stationery",
  "description": "Textbooks, notebooks, pens, etc.",
  "icon": "📚"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Category created successfully",
  "data": {
    "id": 5,
    "name": "Books & Stationery",
    "description": "Textbooks, notebooks, pens, etc.",
    "icon": "📚"
  }
}
```

---

### 4. Update Category (Admin)

**PUT** `/categories/:id`

Update an existing category.

**Access:** Admin only

**Request Body:**

```json
{
  "name": "Books & School Supplies",
  "description": "Updated description",
  "icon": "📚",
  "is_active": true
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Category updated successfully",
  "data": {
    "id": 5,
    "name": "Books & School Supplies",
    "description": "Updated description",
    "icon": "📚",
    "is_active": true
  }
}
```

---

### 5. Delete Category (Admin)

**DELETE** `/categories/:id`

Soft delete a category. Cannot delete if in use.

**Access:** Admin only

**Response (200):**

```json
{
  "success": true,
  "message": "Category deleted successfully"
}
```

**Error (400) - In Use:**

```json
{
  "success": false,
  "message": "Cannot delete category that is currently in use"
}
```

---

### 6. Toggle Category Status (Admin)

**PATCH** `/categories/:id/toggle`

Enable or disable a category.

**Access:** Admin only

**Response (200):**

```json
{
  "success": true,
  "message": "Category deactivated successfully",
  "data": {
    "id": 5,
    "is_active": false
  }
}
```

---

## Locations

### 1. Get All Locations

**GET** `/locations`

List all active locations.

**Access:** Public

**Query Parameters:**

- `is_storage_location`: Filter by storage locations (true/false)

**Example:**

```
GET /locations?is_storage_location=true
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": 5,
      "name": "Library",
      "building": "Main Building",
      "floor": "2nd Floor",
      "description": "University main library",
      "is_storage_location": false,
      "is_active": true
    },
    {
      "id": 8,
      "name": "Security Office",
      "building": "Admin Building",
      "floor": "Ground Floor",
      "description": "Main security office",
      "is_storage_location": true,
      "is_active": true
    }
  ]
}
```

---

### 2. Get Location by ID

**GET** `/locations/:id`

Get single location details.

---

### 3. Create Location (Admin)

**POST** `/locations`

Create a new location.

**Access:** Admin only

**Request Body:**

```json
{
  "name": "Cafeteria",
  "building": "Student Center",
  "floor": "1st Floor",
  "description": "Main cafeteria area",
  "is_storage_location": false
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Location created successfully",
  "data": {
    "id": 10,
    "name": "Cafeteria",
    "building": "Student Center",
    "floor": "1st Floor",
    "description": "Main cafeteria area",
    "is_storage_location": false
  }
}
```

---

### 4. Update Location (Admin)

**PUT** `/locations/:id`

Update an existing location.

**Access:** Admin only

**Request Body:**

```json
{
  "name": "Updated Location Name",
  "building": "Updated Building",
  "floor": "3rd Floor",
  "description": "Updated description",
  "is_storage_location": true,
  "is_active": true
}
```

---

### 5. Delete Location (Admin)

**DELETE** `/locations/:id`

Soft delete a location. Cannot delete if in use.

**Access:** Admin only

---

### 6. Toggle Location Status (Admin)

**PATCH** `/locations/:id/toggle`

Enable or disable a location.

**Access:** Admin only

**Response (200):**

```json
{
  "success": true,
  "message": "Location deactivated successfully",
  "data": {
    "id": 10,
    "is_active": false
  }
}
```

---

## Error Handling

### Standard Error Response

All errors follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "field_name",
      "message": "Validation error message"
    }
  ]
}
```

### HTTP Status Codes

- **200 OK** - Success
- **201 Created** - Resource created
- **400 Bad Request** - Validation error
- **401 Unauthorized** - Missing or invalid token
- **403 Forbidden** - Insufficient permissions
- **404 Not Found** - Resource not found
- **409 Conflict** - Duplicate resource
- **429 Too Many Requests** - Rate limit exceeded
- **500 Internal Server Error** - Server error

### Common Error Examples

**Validation Error (400):**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "title",
      "message": "Title must be at least 5 characters"
    },
    {
      "field": "category_id",
      "message": "Category ID is required"
    }
  ]
}
```

**Unauthorized (401):**

```json
{
  "success": false,
  "message": "Authentication required"
}
```

**Forbidden (403):**

```json
{
  "success": false,
  "message": "Access denied"
}
```

**Not Found (404):**

```json
{
  "success": false,
  "message": "Lost item not found"
}
```

---

## Rate Limiting

**Development:**

- Auth endpoints: 1000 requests per 15 minutes
- General endpoints: 10000 requests per 15 minutes

**Production:**

- Auth endpoints: 100 requests per 15 minutes
- General endpoints: 300 requests per 15 minutes

**Rate Limit Headers:**

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700123456789
```

**Rate Limit Exceeded (429):**

```json
{
  "success": false,
  "message": "Too many requests, please try again later"
}
```

---

## Testing Workflow

### Complete User Journey Example

1. **Register and Login:**

```bash
POST /api/auth/register
POST /api/auth/login
```

2. **Report Lost Item:**

```bash
POST /api/lost-items
# Upload: title, description, images, category, location, date
```

3. **Admin Approves:**

```bash
PATCH /api/lost-items/456/review
# Body: { "status": "approved" }
```

4. **Find Matches:**

```bash
GET /api/matches/lost/456
# Auto-saves top 5 matches
```

5. **View Saved Matches:**

```bash
GET /api/matches/saved/lost/456
```

6. **Confirm Match:**

```bash
PATCH /api/matches/12/status
# Body: { "status": "confirmed" }
```

7. **Contact Finder:**

```bash
GET /api/found-items/789
# Get reporter contact details
```

---

## File Upload Guidelines

**Supported Formats:** JPG, JPEG, PNG, GIF  
**Max Files:** 5 per item  
**Max Size:** 5MB per file  
**Total Max:** 25MB per request

**Upload Using Postman:**

1. Select `POST` method
2. Choose `Body` → `form-data`
3. Add key `images` with type `File`
4. Select multiple files (hold Ctrl/Cmd)
5. Add other fields as `Text` type

---

## Security Best Practices

1. **Always use HTTPS in production**
2. **Store tokens securely** (never in localStorage for sensitive apps)
3. **Refresh tokens before expiration** (access: 7 days, refresh: 30 days)
4. **Logout on sensitive actions**
5. **Validate file uploads** (size, type, content)
6. **Sanitize user input** (API does this automatically)
7. **Use strong passwords** (min 8 chars, mixed case, numbers, symbols)

---

## Support

For issues or questions, contact the development team.

**API Version:** 1.0  
**Last Updated:** November 19, 2025
