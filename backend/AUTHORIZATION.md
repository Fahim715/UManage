# Authorization patterns for future modules

Route middleware checks authentication and broad role eligibility. Services
must still load the target resource and check ownership or department scope.
Never make authorization decisions from request body fields such as `role`,
`user_id`, `department_id`, `created_by`, or `reviewed_by`.

## Department-scoped review route

```ts
leaveRouter.patch(
  "/:id/review",
  authMiddleware,
  requireManagerOrAdmin,
  asyncHandler(leaveController.review)
);
```

The service loads the request by its route ID, then applies the resource check
before any update:

```ts
const leave = await leaveRepository.findById(id);
if (!leave) throw ApiError.notFound("Leave request not found");
assertManagerDepartmentAccess(user, leave.department_id);
await leaveRepository.setReview(id, status, user.id);
```

Here `user` is `req.user`, passed from the controller. The reviewer identity
comes from that authenticated context; it is never taken from the client.

## Employee-owned task updates

```ts
const task = await taskRepository.findById(id);
if (!task) throw ApiError.notFound("Task not found");
assertOwnerOrManagerOfDepartmentOrAdmin(
  user,
  task.assigned_to,
  task.department_id
);

if (user.role === "EMPLOYEE") {
  // Validate/allow only the status field for employee updates.
  await taskRepository.updateStatus(id, validatedStatus);
} else {
  await taskRepository.updateManagerFields(id, validatedManagerInput);
}
```

The service obtains owner and department IDs from the database row, not the
request body. Create operations should likewise set `created_by` and other
identity fields from `req.user`; managers' `department_id` must come from
their authenticated context.
